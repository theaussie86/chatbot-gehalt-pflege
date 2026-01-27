import { getInquiries } from '@/app/actions/inquiries';
import InquiryTable from './InquiryTable';

export default async function InquiriesPage() {
  const { data: inquiries, count } = await getInquiries();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
          Gehaltsanfragen
        </h1>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <InquiryTable initialData={inquiries || []} totalCount={count} />
      </div>
    </div>
  );
}
