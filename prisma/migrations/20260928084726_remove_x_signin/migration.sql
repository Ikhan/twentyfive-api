-- AlterEnum
BEGIN;
CREATE TYPE "OAuthProvider_new" AS ENUM ('GOOGLE', 'FACEBOOK');
ALTER TABLE "oauth_accounts" ALTER COLUMN "provider" TYPE "OAuthProvider_new" USING ("provider"::text::"OAuthProvider_new");
ALTER TYPE "OAuthProvider" RENAME TO "OAuthProvider_old";
ALTER TYPE "OAuthProvider_new" RENAME TO "OAuthProvider";
DROP TYPE "public"."OAuthProvider_old";
COMMIT;

