import type { PaginationParams } from "@/lib/api";

export type PropertyType = "apartment" | "house" | "office";

export type PropertyStatus = "available" | "reserved" | "leased";

export type Property = {
  id: string;
  title: string;
  type: PropertyType;
  status: PropertyStatus;
  address: string;
  city: string;
  district?: string;
  monthlyRent: number;
  currency: string;
  areaSqm: number;
  bedrooms?: number;
  images: string[];
};

export type PropertyListParams = PaginationParams & {
  type?: PropertyType;
  city?: string;
  minRent?: number;
  maxRent?: number;
};
