import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DawgShop - a student marketplace for UGA",
  description:
    "DawgShop is a student-built marketplace where verified UGA students buy and sell dorm and apartment stuff. A class project for ENTR 5000.",
};

// Public landing page for signed-out visitors (and the QR code). It explains
// what DawgShop is before anyone sees a sign-in form, so the first page isn't
// a bare email + password box on a new domain.
export default function AboutPage() {
  return (
    <div className="signin about">
      <div className="wordmark big">DawgShop</div>
      <p className="lede">
        A marketplace where UGA students buy and sell with each other: furniture, textbooks,
        mini fridges, tickets and more.
      </p>

      <ul className="about-list">
        <li>
          <strong>Students only.</strong> Every account is verified with a one-time code sent to
          an @uga.edu email.
        </li>
        <li>
          <strong>Pick up near you.</strong> Filter by dorm or apartment complex, not a map
          radius.
        </li>
        <li>
          <strong>Move-in listings.</strong> List your stuff in May for the freshmen arriving in
          August.
        </li>
        <li>
          <strong>No payments in the app.</strong> Meet up on campus and pay in person.
        </li>
      </ul>

      <Link href="/signin" className="btn primary block">
        Sign in or create an account
      </Link>

      <p className="proto">
        DawgShop is a student project built for ENTR 5000 (AI in Entrepreneurship) at the
        University of Georgia, Fall 2026. It is not run by or affiliated with UGA. DawgShop
        never asks for your UGA MyID password; you create a separate password just for this
        site.{" "}
        <a href="https://github.com/conner1520-cmyk/DawgShop">See the source code on GitHub</a>.
      </p>
    </div>
  );
}
