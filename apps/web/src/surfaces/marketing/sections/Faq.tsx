import { FaqAccordion, type IFaqItem } from '../components/FaqAccordion.tsx';
import { SectionHeading } from '../components/SectionHeading.tsx';

/** Answers duplicated in apex.html's FAQPage JSON-LD — keep both in sync. */
const FAQ_ITEMS: IFaqItem[] = [
  {
    id: 'what-is-siapp',
    question: 'What is Siapp?',
    answer:
      'Siapp is a client-facing project-management platform for professional-services firms. It combines internal project tracking, automatic WhatsApp updates, and a simple client progress portal.',
  },
  {
    id: 'client-app',
    question: 'Does the client need to install an app?',
    answer:
      'No. The client receives a WhatsApp link and opens a mobile-friendly project page in their browser.',
  },
  {
    id: 'replace-whatsapp',
    question: 'Does Siapp replace WhatsApp?',
    answer:
      'No. Siapp makes WhatsApp updates more structured and consistent. Clients can still contact the firm through its normal WhatsApp number.',
  },
  {
    id: 'who-for',
    question: 'Who is Siapp designed for?',
    answer:
      'Siapp is initially designed for Malaysian construction and legal firms that currently manage project progress through spreadsheets, WhatsApp, and shared documents.',
  },
  {
    id: 'existing-process',
    question: 'Can we use our existing project process?',
    answer:
      'Yes. Firms can begin from a starter project, duplicate an existing successful project, and adjust the tasks and dates to match their own process.',
  },
  {
    id: 'client-visibility',
    question: 'Can clients see everything in the project?',
    answer: 'No. The firm controls which tasks and documents are visible to the client.',
  },
  {
    id: 'availability',
    question: 'Is Siapp available now?',
    answer: 'Siapp is currently accepting early-access interest from firms in Malaysia.',
  },
];

/** FAQ — brief §18, verbatim. */
export function Faq() {
  return (
    <section id="faq" className="py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading title="Frequently asked questions" align="center" />
        <div className="mt-10">
          <FaqAccordion items={FAQ_ITEMS} />
        </div>
      </div>
    </section>
  );
}
