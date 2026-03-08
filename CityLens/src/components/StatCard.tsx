import type { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  number: string;
  label: string;
}

export default function StatCard({ icon, number, label }: StatCardProps) {
  return (
    <div className="bg-[#111D32] border border-[#1E3050] rounded-xl p-6 transition-transform hover:-translate-y-1 duration-300 group">
      <div className="text-[#3B82F6] mb-4 group-hover:scale-110 transition-transform origin-left w-max">
        {icon}
      </div>
      <div className="text-[28px] font-bold text-white mb-1">
        {number}
      </div>
      <div className="text-[#94A3B8] text-[14px] leading-snug">
        {label}
      </div>
      <div className="h-[2px] bg-[#3B82F6] w-[40px] mt-6 group-hover:w-[60px] transition-all duration-300" />
    </div>
  );
}
