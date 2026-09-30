import { File, Paths } from 'expo-file-system';
import type { DeepPartial } from 'react-hook-form';
import type { CreateApplicationInput } from '@loan-pilot/domain';

/**
 * The in-progress application, saved on the device so closing the app doesn't
 * lose the applicant's answers. Signatures, initials and the consent/terms
 * ticks are deliberately left out: those must be given afresh when submitting.
 */
export type ApplicationDraft = DeepPartial<
  Omit<CreateApplicationInput, 'signature' | 'initials' | 'consent' | 'tcAccepted'>
>;

const draftFile = () => new File(Paths.document, 'application-draft.json');

export const saveDraft = (values: DeepPartial<CreateApplicationInput>): void => {
  const {
    signature: _signature,
    initials: _initials,
    consent: _consent,
    tcAccepted: _tc,
    ...rest
  } = values;
  try {
    const file = draftFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(rest));
  } catch {
    // Best-effort: a failed save only means the draft isn't restored later.
  }
};

export const loadDraft = (): ApplicationDraft | null => {
  try {
    const file = draftFile();
    if (!file.exists) return null;
    const parsed: ApplicationDraft = JSON.parse(file.textSync());
    return parsed;
  } catch {
    return null;
  }
};

export const clearDraft = (): void => {
  try {
    const file = draftFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to clear.
  }
};
