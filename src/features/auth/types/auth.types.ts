export type UserRole = "tenant" | "landlord" | "admin";

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};
