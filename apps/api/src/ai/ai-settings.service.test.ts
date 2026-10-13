import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AiProvider } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AiSettingsService } from './ai-settings.service';
import { SecretBox } from './secret-box';
import { AiProviderRegistry } from './providers/provider-registry';
import { AiProviderError } from './providers/ai-provider';

describe('AiSettingsService', () => {
  const verify = jest.fn();
  const client = { provider: AiProvider.Anthropic, limits: {}, review: jest.fn(), verify };
  const credentialUpsert = jest.fn();
  const credentialFindUnique = jest.fn();
  const settingsFindUnique = jest.fn();
  const settingsUpsert = jest.fn();
  const prismaMock = {
    tenantSettings: {
      findUnique: settingsFindUnique,
      upsert: settingsUpsert,
      updateMany: jest.fn(),
    },
    aiProviderCredential: {
      findUnique: credentialFindUnique,
      findMany: jest.fn().mockResolvedValue([]),
      upsert: credentialUpsert,
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const box = new SecretBox();
  let service: AiSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiSettingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SecretBox, useValue: box },
        {
          provide: AiProviderRegistry,
          useValue: {
            get: (provider: AiProvider) => (provider === AiProvider.Anthropic ? client : undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AiSettingsService);
  });

  it('verifies a new key with the provider, then stores it encrypted with a hint', async () => {
    credentialFindUnique.mockResolvedValue(null);
    const key = 'sk-ant-api03-abcdefghijklmnopWXYZ';

    await service.saveCredential('t1', 'Admin', AiProvider.Anthropic, {
      apiKey: key,
      model: 'claude-opus-5-5',
    });

    expect(verify).toHaveBeenCalledWith(key, 'claude-opus-5-5');
    const saved = credentialUpsert.mock.calls[0][0].create;

    expect(saved.apiKeyHint).toBe('…WXYZ');
    expect(saved.apiKeyCipher).not.toContain(key);
    expect(box.decrypt(saved.apiKeyCipher)).toBe(key);
  });

  it('does not save a key the provider rejects', async () => {
    credentialFindUnique.mockResolvedValue(null);
    verify.mockRejectedValueOnce(new AiProviderError('Claude rejected the API key.', 'auth'));
    await expect(
      service.saveCredential('t1', 'Admin', AiProvider.Anthropic, {
        apiKey: 'sk-ant-api03-wrong-key-000000',
        model: 'claude-opus-5-5',
      }),
    ).rejects.toThrow('Claude rejected the API key.');
    expect(credentialUpsert).not.toHaveBeenCalled();
  });

  it('rejects providers that are not implemented and models outside the catalog', async () => {
    await expect(
      service.saveCredential('t1', 'Admin', AiProvider.OpenAi, {
        apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxx',
        model: 'gpt',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.saveCredential('t1', 'Admin', AiProvider.Anthropic, {
        apiKey: 'sk-ant-api03-abcdefghijklmnop',
        model: 'claude-2',
      }),
    ).rejects.toThrow('Choose one of the Claude models listed.');
  });

  it('refuses to activate a provider without a stored key', async () => {
    credentialFindUnique.mockResolvedValue(null);
    await expect(service.setActive('t1', AiProvider.Anthropic)).rejects.toThrow(
      'Save an API key for this provider before making it active.',
    );
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it('explains how to set up AI review when none is active', async () => {
    settingsFindUnique.mockResolvedValue({ aiProvider: null });
    await expect(service.resolveActive('t1')).rejects.toThrow(/Settings → AI review/);
  });

  it('resolves the active provider with its decrypted key', async () => {
    settingsFindUnique.mockResolvedValue({ aiProvider: 'anthropic' });
    credentialFindUnique.mockResolvedValue({
      apiKeyCipher: box.encrypt('sk-live'),
      model: 'claude-sonnet-5-5',
    });
    const config = await service.resolveActive('t1');

    expect(config).toMatchObject({
      provider: AiProvider.Anthropic,
      model: 'claude-sonnet-5-5',
      apiKey: 'sk-live',
    });
  });
});
