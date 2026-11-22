-- Movable, resizable panels: each user's arrangement (additive).
ALTER TABLE "UserPreference" ADD COLUMN "layouts" JSONB;
