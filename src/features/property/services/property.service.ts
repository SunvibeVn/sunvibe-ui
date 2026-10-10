import "server-only";

import { serverEnv } from "@/config/env";
import { createHttpClient, type Paginated } from "@/lib/api";
import type { Property, PropertyListParams } from "../types/property.types";

// Endpoint paths follow an assumed REST contract; align them with property-service.
const propertyApi = createHttpClient({ baseUrl: () => serverEnv.propertyServiceUrl });

export const propertyService = {
  list(params: PropertyListParams = {}) {
    return propertyApi.get<Paginated<Property>>("/properties", { query: params });
  },

  getById(id: string) {
    return propertyApi.get<Property>(`/properties/${encodeURIComponent(id)}`);
  },
};
