import type { ReactNode } from "react";
import { BrainIcon, ChatIcon, FileCheckIcon } from "@/components/icons";

export type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
};

export const features: Feature[] = [
  {
    title: "AI-Powered Matchmaking",
    description:
      "Our intelligent algorithms instantly connect landlords with the ideal tenants by analyzing preferences, behavioral patterns, and real-time market data.",
    icon: <BrainIcon strokeWidth={1.75} />,
  },
  {
    title: "Intelligent Workflow Automation",
    description:
      "Say goodbye to manual paperwork. Automate lease agreements, background checks, and rent tracking with our secure, agentic workflows.",
    icon: <FileCheckIcon strokeWidth={1.75} />,
  },
  {
    title: "24/7 Virtual Leasing Assistant",
    description:
      "Never miss a lead. Our conversational AI assistant handles inquiries, qualifies prospects, and schedules property viewings around the clock.",
    icon: <ChatIcon strokeWidth={1.75} />,
  },
];

export const heroStats = [
  { value: "24/7", label: "AI assistant" },
  { value: "3", label: "Property types" },
  { value: "100%", label: "Digital leasing" },
];

export const propertySearchTypes = [
  { value: "apartment", label: "Apartment" },
  { value: "home", label: "Home" },
  { value: "villa", label: "Villa" },
] as const;

export const searchAreas = [
  { value: "district-1", label: "District 1, Ho Chi Minh City" },
  { value: "thu-duc", label: "Thu Duc City, Ho Chi Minh City" },
  { value: "district-7", label: "District 7, Ho Chi Minh City" },
  { value: "binh-thanh", label: "Binh Thanh, Ho Chi Minh City" },
  { value: "ha-noi", label: "Hanoi" },
  { value: "da-nang", label: "Da Nang" },
] as const;

export const searchPriceMinOptions = [
  { value: "500", label: "$500" },
  { value: "1000", label: "$1,000" },
  { value: "1500", label: "$1,500" },
  { value: "2000", label: "$2,000" },
  { value: "3000", label: "$3,000" },
] as const;

export const searchPriceMaxOptions = [
  { value: "1000", label: "$1,000" },
  { value: "2000", label: "$2,000" },
  { value: "3000", label: "$3,000" },
  { value: "5000", label: "$5,000" },
  { value: "10000", label: "$10,000+" },
] as const;

// Illustrative data for the hero product mock-up, not real users.
export const previewListing = {
  title: "2BR Apartment · District 2, HCMC",
  details: "Furnished · River view · Available Nov 1",
};

export const previewMatches = [
  { name: "Linh N.", note: "Remote worker, 12-mo lease", score: 97 },
  { name: "David K.", note: "Relocating family of 3", score: 91 },
  { name: "Mai T.", note: "Graduate student, pet-free", score: 84 },
];
