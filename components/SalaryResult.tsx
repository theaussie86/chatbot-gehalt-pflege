import React from 'react';
import { SalaryResultData } from '../types';
import { Calculator, ArrowRight, Coins, Building2 } from 'lucide-react';

interface SalaryResultProps {
  data: SalaryResultData;
}

export const SalaryResult: React.FC<SalaryResultProps> = ({ data }) => {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mt-4 animate-fade-in-up">
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Calculator size={20} className="text-blue-400" />
            <h3 className="font-semibold text-lg">Ergebnis {data.jahr}</h3>
        </div>
        <span className="text-xs bg-blue-600 px-2 py-1 rounded text-white font-medium">Geschätzt</span>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm text-slate-600 mb-2">
            <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-slate-400">Tarif</span>
                <span className="font-medium text-slate-800">{data.tarif}</span>
            </div>
            <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-slate-400">Gruppe / Stufe</span>
                <span className="font-medium text-slate-800">{data.gruppe} / {data.stufe}</span>
            </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
                <span className="text-slate-600">Bruttogehalt</span>
                <span className="font-semibold text-slate-800">{formatCurrency(data.brutto)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-red-500">
                <span>Steuern</span>
                <span>- {formatCurrency(data.steuer)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-amber-600">
                <span>Sozialabgaben</span>
                <span>- {formatCurrency(data.sozialabgaben)}</span>
            </div>
        </div>

        <div className="border-t-2 border-slate-100 pt-4 mt-2">
            <div className="flex justify-between items-end">
                <span className="text-slate-500 font-medium pb-1">Nettogehalt</span>
                <span className="text-2xl font-bold text-blue-600">{formatCurrency(data.netto)}</span>
            </div>
        </div>
      </div>
      
      <div className="bg-slate-50 p-3 text-xs text-center text-slate-400 border-t border-slate-100">
        Alle Angaben sind unverbindliche Schätzungen.
      </div>
    </div>
  );
};