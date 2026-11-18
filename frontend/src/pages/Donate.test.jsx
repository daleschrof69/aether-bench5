import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Donate from "./Donate";

let root, container, clipboardDescriptor;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Donate />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else delete navigator.clipboard;
});

test("shows and copies the requested e-Transfer recipient", async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  expect(container.querySelector('[data-testid="donation-recipient"]').textContent).toBe("katiespellman4@gmail.com");
  await act(async () => container.querySelector("button").click());
  expect(writeText).toHaveBeenCalledWith("katiespellman4@gmail.com");
  expect(container.querySelector('[role="status"]').textContent).toBe("Email address copied.");
});

test("provides a manual copy option if clipboard access fails", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
  });
  await act(async () => container.querySelector("button").click());
  expect(container.querySelector('[role="status"]').textContent).toMatch(/Select the email address/);
});
