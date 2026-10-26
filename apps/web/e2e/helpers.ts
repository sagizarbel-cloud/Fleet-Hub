export const ADMIN = {
  email: 'admin@fleethub.test',
  password: process.env.SEED_PASSWORD ?? 'fleethub-dev',
};
export const STORAGE_STATE = 'test-results/.auth/admin.json';
export const SIGNED_OUT = { cookies: [], origins: [] };
export const VIEWER = { email: 'viewer@fleethub.test', password: ADMIN.password };
export const VIEWER_STATE = 'test-results/.auth/viewer.json';
