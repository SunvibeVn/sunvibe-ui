import "server-only";

// Backend service URLs stay on the server: the browser never calls the
// microservices directly, only Server Components / Server Actions do.
// Getters are lazy so pages that don't touch a service build without its URL.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const serverEnv = {
  get authServiceUrl() {
    return required("AUTH_SERVICE_URL");
  },
  get propertyServiceUrl() {
    return required("PROPERTY_SERVICE_URL");
  },
};
