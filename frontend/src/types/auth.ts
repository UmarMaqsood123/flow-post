/** Mirrors `PublicUser` in backend/src/models/user.model.ts. */
export interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}
