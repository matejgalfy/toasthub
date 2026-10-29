/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
  // Lets the Tailwind plugin know the theme tokens (`bg-primary`, ...) so it sorts them like built-ins.
  tailwindStylesheet: './apps/web/src/styles/index.css',
};
