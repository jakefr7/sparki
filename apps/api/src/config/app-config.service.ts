import { Injectable } from '@nestjs/common';
import { loadApiEnv, type ApiEnv } from '@sparki/config';

@Injectable()
export class AppConfigService {
  private readonly env: ApiEnv = loadApiEnv();

  get nodeEnv(): ApiEnv['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.API_PORT;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get corsOrigin(): string {
    return this.env.CORS_ORIGIN;
  }

  get developmentAuthMode(): ApiEnv['SPARKI_DEVELOPMENT_AUTH'] {
    return this.env.SPARKI_DEVELOPMENT_AUTH;
  }

  get workos(): {
    apiKey: string | undefined;
    clientId: string | undefined;
    redirectUri: string | undefined;
    cookiePassword: string | undefined;
  } {
    return {
      apiKey: this.env.WORKOS_API_KEY,
      clientId: this.env.WORKOS_CLIENT_ID,
      redirectUri: this.env.WORKOS_REDIRECT_URI,
      cookiePassword: this.env.WORKOS_COOKIE_PASSWORD,
    };
  }

  get addressProvider(): { mapboxAccessToken: string | undefined } {
    return { mapboxAccessToken: this.env.MAPBOX_ACCESS_TOKEN };
  }
}
