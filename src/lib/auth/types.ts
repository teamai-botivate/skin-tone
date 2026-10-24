export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthenticatedUser extends User {
  credits?: number;
}
