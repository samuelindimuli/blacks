module.exports = {
  content: ["./**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'primary': '#FF5E14',
        'secondary': '#1A1A1A',
        'accent': '#FF9E00',
        'light': '#FFFFFF',
        'dark': '#121212',
        'gray-light': '#F5F5F5',
        'text': '#333333',
        'text-light': '#777777',
      },
      fontFamily: {
        'primary': ['Poppins', 'sans-serif'],
      },
      boxShadow: {
        'sm': '0 2px 8px rgba(0,0,0,0.1)',
        'md': '0 4px 12px rgba(0,0,0,0.15)',
        'lg': '0 8px 24px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
}