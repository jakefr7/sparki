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

  get attachmentStorage() {
    return {
      endpoint: this.env.ATTACHMENT_S3_ENDPOINT,
      region: this.env.ATTACHMENT_S3_REGION,
      bucket: this.env.ATTACHMENT_S3_BUCKET,
      accessKeyId: this.env.ATTACHMENT_S3_ACCESS_KEY_ID,
      secretAccessKey: this.env.ATTACHMENT_S3_SECRET_ACCESS_KEY,
    };
  }

  get stripe(): { secretKey: string | undefined; webhookSecret: string | undefined; priceStandard: string | undefined } {
    return {
      secretKey: this.env.STRIPE_SECRET_KEY,
      webhookSecret: this.env.STRIPE_WEBHOOK_SECRET,
      priceStandard: this.env.STRIPE_PRICE_STANDARD,
    };
  }

  get email(): { resendApiKey: string | undefined; from: string | undefined } {
    return {
      resendApiKey: this.env.RESEND_API_KEY,
      from: this.env.EMAIL_FROM,
    };
  }

  /** Web app origin — also used to build activation/invitation links
   *  (`${webOrigin}/invite/:token`). Reuses CORS_ORIGIN rather than adding a
   *  second "what is the frontend's URL" variable: it is already exactly
   *  that value. */
  get webOrigin(): string {
    return this.env.CORS_ORIGIN;
  }
}
