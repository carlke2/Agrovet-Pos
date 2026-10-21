/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--primary)",
        background: "var(--background)",
        foreground: "var(--text)",
        surface: "var(--surface)",
        sand: "var(--border)",
        ink: "var(--text)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--surface)",
          hover: "var(--primary-hover)",
          tint: "var(--primary-tint)",
          50: "var(--primary-50)",
          100: "var(--primary-100)",
          200: "var(--primary-200)",
          300: "var(--primary-300)",
          400: "var(--primary-400)",
          500: "var(--primary-500)",
          600: "var(--primary-600)",
          700: "var(--primary-700)",
          800: "var(--primary-800)",
          900: "var(--primary-900)",
        },
        secondary: {
          DEFAULT: "var(--primary-tint)",
          foreground: "var(--primary)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--surface)",
        },
        muted: {
          DEFAULT: "var(--primary-tint)",
          foreground: "var(--muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-ink)",
        },
        popover: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text)",
        },
        card: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        inactive: "var(--inactive)",
      },
      borderRadius: {
        card: "12px",
        control: "10px",
        pill: "9999px",
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
