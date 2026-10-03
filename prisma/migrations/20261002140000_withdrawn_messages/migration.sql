-- A message Sparki withdrew before it reached the provider (an opt-out, a
-- changed or cancelled appointment, texting becoming unavailable). Distinct
-- from FAILED, which means the provider or carrier refused it.
ALTER TYPE "ClientCommunicationMessageStatus" ADD VALUE 'CANCELLED';
