/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--color-brand)',
          50: 'var(--color-primary-light)',
          100: 'var(--color-primary-light)',
          200: 'var(--color-brand-border)',
          300: 'var(--color-brand-border)',
          400: 'var(--color-brand)',
          500: 'var(--color-brand)',
          600: 'var(--color-primary)',
          700: 'var(--color-primary-hover)',
          800: 'var(--color-primary-hover)',
          900: 'var(--color-primary-hover)',
        },
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-light': 'var(--color-primary-light)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        ink: 'var(--color-text-primary)',
        muted: 'var(--color-text-secondary)',
        border: 'var(--color-border)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      fontFamily: { sans: ['Arial', 'Helvetica', 'sans-serif'] },
    },
  },
  plugins: [],
};
