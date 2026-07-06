// Admin dashboard visibility. Always on so admins can reach /admin in
// production too; the button and routes stay gated behind `isAdmin`, and every
// /api/admin/* endpoint is protected by `protect + isAdmin` on the backend, so
// non-admins see nothing and can read nothing regardless.
export const isAdminPanelEnabled = true;
