/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        headings: ["Open Sans", "sans-serif"],
        form: ["Open Sans", "sans-serif"],
        form1: ["Open Sans", "sans-serif"],
        form2: ["Open Sans", "sans-serif"],
        form3: ["Open Sans", "sans-serif"],
      },
      colors: {
        // Bound to CSS custom properties (defined in src/index.css for
        // `:root` and overridden under `.dark`) instead of literal hex, so
        // every utility built from these tokens — and every custom
        // component-layer rule using theme("colors.brand.x") — repaints
        // automatically when the dark-mode toggle flips the `dark` class on
        // <html>, with no per-usage edits needed.
        brand: {
          navy: "rgb(var(--brand-navy) / <alpha-value>)",
          navydeep: "rgb(var(--brand-navydeep) / <alpha-value>)",
          navylight: "rgb(var(--brand-navylight) / <alpha-value>)",
          canvas: "rgb(var(--brand-canvas) / <alpha-value>)",
          muted: "rgb(var(--brand-muted) / <alpha-value>)",
          gold: "rgb(var(--brand-gold) / <alpha-value>)",
          goldlight: "rgb(var(--brand-goldlight) / <alpha-value>)",
          coral: "rgb(var(--brand-coral) / <alpha-value>)",
          error: "rgb(var(--brand-error) / <alpha-value>)",
          teal: "rgb(var(--brand-teal) / <alpha-value>)",
          cream: "rgb(var(--brand-cream) / <alpha-value>)",
          terracotta: "rgb(var(--brand-terracotta) / <alpha-value>)",
          cactus: "rgb(var(--brand-cactus) / <alpha-value>)",
          pink: "rgb(var(--brand-pink) / <alpha-value>)",
        },
        surface: "rgb(var(--surface) / <alpha-value>)",
      },
      boxShadow: {
        "depth-sm": "0 2px 8px -2px rgba(0,26,80,0.14), 0 1px 2px rgba(0,26,80,0.08)",
        "depth-md": "0 10px 30px -8px rgba(0,26,80,0.16), 0 4px 10px -4px rgba(0,26,80,0.1)",
        "depth-lg": "0 25px 60px -15px rgba(0,26,80,0.2), 0 10px 20px -8px rgba(0,26,80,0.12)",
        "glow-gold": "0 0 0 1px rgba(0,85,255,0.35), 0 0 24px rgba(0,85,255,0.25)",
        "glow-teal": "0 0 0 1px rgba(2,136,203,0.35), 0 0 24px rgba(2,136,203,0.22)",
        "glow-pink": "0 0 0 1px rgba(1,146,219,0.35), 0 0 24px rgba(1,146,219,0.22)",
        "glow-terracotta": "0 0 0 1px rgba(46,107,229,0.35), 0 0 24px rgba(46,107,229,0.22)",
        paper: "0 1px 1px rgba(0,26,80,0.05), 0 8px 24px -8px rgba(0,26,80,0.14), 0 24px 48px -20px rgba(0,26,80,0.12)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px) translateX(0px)" },
          "50%": { transform: "translateY(-18px) translateX(6px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px) translateX(0px) scale(1)" },
          "50%": { transform: "translateY(20px) translateX(-10px) scale(1.05)" },
        },
        unfold: {
          "0%": { opacity: "0", transform: "rotateX(-12deg) translateY(40px) scale(0.96)" },
          "100%": { opacity: "1", transform: "rotateX(0deg) translateY(0) scale(1)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        "float-slow": "floatSlow 11s ease-in-out infinite",
        unfold: "unfold 0.8s cubic-bezier(.2,.7,.2,1) both",
      },
    },
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
  },
  plugins: [],
};

