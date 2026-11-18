import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "./AuthContext";

jest.mock("axios", () => ({
  create: () => ({ get: jest.fn(), post: jest.fn() }),
}));

let auth, root, container, locationDescriptor;
function Consumer() {
  auth = useAuth();
  return null;
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  locationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", { configurable: true, value: { assign: jest.fn() } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AuthProvider><Consumer /></AuthProvider>));
  auth.http.get.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(window, "location", locationDescriptor);
});

test("starts Google sign-in through the app API", async () => {
  auth.http.get.mockResolvedValue({ data: { google: true } });
  await auth.startGoogleAuth();
  expect(auth.http.get).toHaveBeenCalledWith("/auth/providers");
  expect(window.location.assign).toHaveBeenCalledWith(`${process.env.REACT_APP_BACKEND_URL || ""}/api/auth/google`);
});

test("explains missing Google configuration and keeps email sign-in available", async () => {
  auth.http.get.mockResolvedValue({ data: { google: false } });
  await expect(auth.startGoogleAuth()).rejects.toThrow("Use email and password");
  expect(window.location.assign).not.toHaveBeenCalled();
  auth.http.post.mockResolvedValue({ data: { email: "tester@example.com" } });
  await act(async () => auth.loginEmail("tester@example.com", "test-password"));
  expect(auth.user.email).toBe("tester@example.com");
});

test("does not navigate if provider discovery fails", async () => {
  auth.http.get.mockRejectedValue(new Error("Network unavailable"));
  await expect(auth.startGoogleAuth()).rejects.toThrow("Network unavailable");
  expect(window.location.assign).not.toHaveBeenCalled();
});
