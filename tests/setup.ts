import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// Test placeholders — src/lib/django.ts fails fast at module load when these
// are unset (no insecure fallback keys), so every test needs dummy values.
process.env.DJANGO_URL ??= "http://django-test.local";
process.env.INTERNAL_API_KEY ??= "test-internal-api-key";
