/** @type {import('tailwindcss').Config} */
export default {
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
        brand: {
          navy: "#001A50",
          navydeep: "#202838",
          navylight: "#0149D9",
          canvas: "#F3F7FF",
          muted: "#2E384D",
          gold: "#0055FF",
          goldlight: "#01D3D3",
          coral: "#2E6BE5",
          error: "#E23744",
          teal: "#0288CB",
          cream: "#F7FAFF",
          terracotta: "#2E6BE5",
          cactus: "#2EA8E5",
          pink: "#0192DB",
        },
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

