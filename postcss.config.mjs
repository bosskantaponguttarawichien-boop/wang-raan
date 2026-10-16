const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Tailwind v4 เขียน breakpoint แบบ range (`width < 767px`) ซึ่ง Chromium < 104 ไม่รู้จัก → แปลงเป็น max-width/min-width
    "@csstools/postcss-media-minmax": {},
  },
};

export default config;
