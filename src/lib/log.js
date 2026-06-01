export const log = {
  info(message, meta = {}) {
    console.log(message, meta);
  },
  warn(message, meta = {}) {
    console.warn(message, meta);
  },
  error(message, meta = {}) {
    console.error(message, meta);
  }
};
