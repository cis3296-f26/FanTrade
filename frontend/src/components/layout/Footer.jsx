import "./Footer.css";

const YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="footer">
      <span>FanTrade. &copy; {YEAR}</span>
    </footer>
  );
}
