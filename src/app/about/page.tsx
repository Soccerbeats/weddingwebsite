import { redirect } from 'next/navigation';

// About content has moved to the home page — scroll to #about
export default function AboutPage() {
    redirect('/#about');
}
