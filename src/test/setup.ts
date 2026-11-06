import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { setLanguage } from "../i18n";

beforeEach(() => setLanguage("en"));
afterEach(cleanup);
