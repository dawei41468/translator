import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import i18n from "@/lib/i18n";
import Login from "../Login";
import Register from "../Register";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    loginAsGuest: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ state: {} }),
  };
});

describe("Auth language selector", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage("en");
  });

  it("Login: switches language when clicking a language tile", async () => {
    render(<Login />);

    // Baseline
    expect(screen.getByTestId("login-submit")).toHaveTextContent("Sign In");

    fireEvent.click(screen.getByTestId("lang-ja"));

    expect(screen.getByTestId("login-submit")).toHaveTextContent("サインイン");
  });

  it("Register: switches language when clicking a language tile", async () => {
    render(<Register />);

    // Baseline
    expect(screen.getByTestId("register-submit")).toHaveTextContent("Register");

    fireEvent.click(screen.getByTestId("lang-zh"));

    expect(screen.getByTestId("register-submit")).toHaveTextContent("注册");
  });
});
