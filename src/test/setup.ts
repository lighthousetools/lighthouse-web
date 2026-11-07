import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { setLanguage } from "../i18n";

// jsdom has no WebGL. The background then falls back to its gradient, as in a browser without it.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => setLanguage("en"));
afterEach(cleanup);
