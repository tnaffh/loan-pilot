import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';

/** Normalised Google identity handed to AuthService.handleOAuth. */
export interface OAuthProfile {
  provider: 'google';
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
}

const callbackUrl = (config: ConfigService): string =>
  config.get<string>('OAUTH_CALLBACK_URL') ??
  `${config.get<string>('PUBLIC_API_ORIGIN') ?? 'http://localhost:4000'}/api/auth/google/callback`;

/**
 * Registered only when GOOGLE_CLIENT_ID is configured (see AuthModule). Maps the
 * Google profile to an OAuthProfile that becomes `req.user` in the callback.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      callbackURL: callbackUrl(config),
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no email'), undefined);
      return;
    }
    const oauthProfile: OAuthProfile = {
      provider: 'google',
      providerAccountId: profile.id,
      email: email.toLowerCase(),
      name: profile.displayName || email,
      picture: profile.photos?.[0]?.value,
    };
    done(null, oauthProfile);
  }
}
