import './globals.css';

export const metadata = { title: 'WebMux', description: 'Manage tmux sessions on remote devices from the browser' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
