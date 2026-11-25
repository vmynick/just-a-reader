// Errors that the UI can translate: the Hungarian message doubles as the i18n key.
export function fail(key, vars) {
  const msg = vars ? key.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : key;
  const err = new Error(msg);
  err.key = key;
  err.vars = vars;
  return err;
}
