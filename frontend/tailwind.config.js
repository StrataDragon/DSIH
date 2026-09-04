/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sahaya: {
          green: "#0f3d2e",
          saffron: "#b85c00",
          sand: "#f7f6f2",
          ink: "#17342c"
        }
      },
      boxShadow: {
        card: "0 10px 30px rgba(15, 61, 46, 0.08)"
      }
    }
  },
  plugins: []
};
