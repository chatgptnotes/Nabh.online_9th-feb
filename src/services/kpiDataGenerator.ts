// KPI Data Generator - Creates realistic dummy data for all 16 NABH KPIs
// Generates 6 months of data with realistic trends and variations

import { NABH_KPIS } from '../data/kpiData';
import type { KPIDefinition } from '../data/kpiData';

// KPIs that should always show zero (no incidents reported)
const ZERO_VALUE_KPI_IDS = ['kpi-2', 'kpi-3', 'kpi-5', 'kpi-6', 'kpi-7', 'kpi-8', 'kpi-9', 'kpi-15', 'kpi-16'];

export interface KPIDataEntry {
  month: string;
  value: number;
  target: number;
  numeratorValue?: number;
  denominatorValue?: number;
  remarks?: string;
}

// Generate the last 6 months in YYYY-MM format
function getLastSixMonths(): string[] {
  const months: string[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(date.toISOString().slice(0, 7));
  }

  return months;
}

// Generate realistic data based on KPI characteristics
function generateRealisticValue(
  kpi: KPIDefinition,
  monthIndex: number,
  totalMonths: number
): { value: number; numerator?: number; denominator?: number } {
  // Force zero for specified KPIs
  if (ZERO_VALUE_KPI_IDS.includes(kpi.id)) {
    let denominator: number | undefined;
    if (kpi.unit === 'Percentage') {
      denominator = Math.floor(Math.random() * 200) + 100;
    } else if (kpi.unit.includes('1000')) {
      denominator = Math.floor(Math.random() * 500) + 200;
    } else if (kpi.unit.includes('100')) {
      denominator = Math.floor(Math.random() * 100) + 50;
    }
    return { value: 0, numerator: 0, denominator };
  }

  const { benchmarkRange, targetDirection } = kpi;
  const range = benchmarkRange.max - benchmarkRange.min;

  // Base value starts slightly off target
  let baseValue: number;

  if (targetDirection === 'lower') {
    // For lower-is-better KPIs, start higher and improve (decrease) over time
    const startOffset = range * 0.4; // Start 40% above minimum
    const improvement = (monthIndex / (totalMonths - 1)) * range * 0.3; // Improve by 30% of range
    baseValue = benchmarkRange.min + startOffset - improvement;
  } else {
    // For higher-is-better KPIs, start lower and improve (increase) over time
    const startOffset = range * 0.3; // Start 30% below maximum
    const improvement = (monthIndex / (totalMonths - 1)) * range * 0.25; // Improve by 25% of range
    baseValue = benchmarkRange.max - startOffset - range * 0.2 + improvement;
  }

  // Add realistic monthly variation (±10%)
  const variation = (Math.random() - 0.5) * range * 0.2;
  let value = baseValue + variation;

  // Ensure value stays within benchmark range
  value = Math.max(benchmarkRange.min, Math.min(value, benchmarkRange.max));

  // Round appropriately based on unit type
  if (kpi.unit === 'Percentage' || kpi.unit === 'Ratio') {
    value = Math.round(value * 10) / 10;
  } else if (kpi.unit === 'Minutes') {
    value = Math.round(value);
  } else {
    value = Math.round(value * 100) / 100;
  }

  // Generate numerator and denominator for certain KPIs
  let numerator: number | undefined;
  let denominator: number | undefined;

  if (kpi.unit === 'Percentage') {
    denominator = Math.floor(Math.random() * 200) + 100; // 100-300 total cases
    numerator = Math.round((value / 100) * denominator);
  } else if (kpi.unit.includes('1000')) {
    denominator = Math.floor(Math.random() * 500) + 200; // 200-700 patient days
    numerator = Math.round((value / 1000) * denominator);
  } else if (kpi.unit.includes('100')) {
    denominator = Math.floor(Math.random() * 100) + 50; // 50-150 procedures
    numerator = Math.round((value / 100) * denominator);
  }

  return { value, numerator, denominator };
}

// Generate remarks based on performance
function generateRemarks(
  kpi: KPIDefinition,
  value: number,
  monthIndex: number
): string {
  // Special remarks for zero-value KPIs
  if (ZERO_VALUE_KPI_IDS.includes(kpi.id)) {
    const zeroRemarks = [
      'Zero incidents reported',
      'No events recorded this period',
      'Nil incidence maintained',
      'Zero events - protocols effective',
      'No incidents - safety measures sustained',
      'Clean record maintained',
    ];
    return zeroRemarks[monthIndex % zeroRemarks.length];
  }

  const isOnTarget = kpi.targetDirection === 'lower'
    ? value <= kpi.suggestedTarget
    : value >= kpi.suggestedTarget;

  const remarks = [
    // On target remarks
    [
      'Within acceptable range',
      'Target achieved',
      'Performance satisfactory',
      'Consistent with benchmarks',
      'Meeting standards',
    ],
    // Off target remarks
    [
      'Action plan initiated',
      'Under review',
      'Improvement measures in progress',
      'Staff training conducted',
      'Process optimization ongoing',
    ],
  ];

  const remarkSet = isOnTarget ? remarks[0] : remarks[1];
  return remarkSet[monthIndex % remarkSet.length];
}

// Generate complete 6-month data for a single KPI
export function generateKPIData(kpi: KPIDefinition): KPIDataEntry[] {
  const months = getLastSixMonths();
  const data: KPIDataEntry[] = [];

  months.forEach((month, index) => {
    const { value, numerator, denominator } = generateRealisticValue(kpi, index, months.length);

    data.push({
      month,
      value,
      target: kpi.suggestedTarget,
      numeratorValue: numerator,
      denominatorValue: denominator,
      remarks: generateRemarks(kpi, value, index),
    });
  });

  return data;
}

// Generate data for all 16 KPIs
export function generateAllKPIData(): Record<string, KPIDataEntry[]> {
  const allData: Record<string, KPIDataEntry[]> = {};

  NABH_KPIS.forEach(kpi => {
    allData[kpi.id] = generateKPIData(kpi);
  });

  return allData;
}

// Save all generated data to localStorage
export function saveAllKPIDataToLocalStorage(): void {
  const allData = generateAllKPIData();

  Object.entries(allData).forEach(([kpiId, data]) => {
    localStorage.setItem(`kpi_data_${kpiId}`, JSON.stringify(data));
  });

  console.log('All KPI data saved to localStorage');
}

// Get specific KPI realistic data examples for different scenarios
export const KPI_DATA_SCENARIOS: Record<string, Partial<Record<string, number[]>>> = {
  // KPI 1: Initial Assessment Time (target: 30 min, lower is better)
  'kpi-1': {
    improving: [45, 42, 38, 35, 32, 28],
    stable: [32, 30, 31, 29, 30, 28],
    challenging: [55, 52, 48, 45, 42, 40],
  },
  // KPI 2: Medication Errors (target: 0.5%, lower is better) - Zero incidents
  'kpi-2': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 3: Transfusion Reactions (target: 0.5%, lower is better) - Zero incidents
  'kpi-3': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 4: ICU SMR (target: 1.0, lower is better)
  'kpi-4': {
    improving: [1.3, 1.2, 1.1, 1.0, 0.95, 0.9],
    stable: [1.0, 0.98, 1.02, 0.99, 1.01, 0.98],
    challenging: [1.4, 1.35, 1.3, 1.25, 1.2, 1.15],
  },
  // KPI 5: Pressure Ulcers (target: 1.0 per 1000 patient days, lower is better) - Zero incidents
  'kpi-5': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 6: CAUTI Rate (target: 3.0, lower is better) - Zero incidents
  'kpi-6': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 7: VAP Rate (target: 5.0, lower is better) - Zero incidents
  'kpi-7': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 8: CLABSI Rate (target: 2.0, lower is better) - Zero incidents
  'kpi-8': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 9: SSI Rate (target: 2.0%, lower is better) - Zero incidents
  'kpi-9': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 10: Hand Hygiene Compliance (target: 85%, higher is better)
  'kpi-10': {
    improving: [72, 76, 80, 83, 86, 89],
    stable: [85, 86, 84, 87, 86, 88],
    challenging: [65, 68, 72, 75, 78, 80],
  },
  // KPI 11: Antibiotic Prophylaxis Compliance (target: 95%, higher is better)
  'kpi-11': {
    improving: [85, 88, 90, 92, 94, 96],
    stable: [95, 96, 94, 95, 96, 97],
    challenging: [80, 82, 85, 87, 89, 91],
  },
  // KPI 12: Diagnostics Wait Time (target: 30 min, lower is better)
  'kpi-12': {
    improving: [50, 45, 40, 35, 32, 28],
    stable: [28, 30, 29, 28, 27, 26],
    challenging: [55, 52, 48, 44, 40, 36],
  },
  // KPI 13: Discharge Time (target: 60 min, lower is better)
  'kpi-13': {
    improving: [95, 88, 80, 72, 65, 58],
    stable: [58, 60, 55, 58, 56, 54],
    challenging: [110, 100, 92, 85, 78, 72],
  },
  // KPI 14: Patient Satisfaction (target: 85%, higher is better)
  'kpi-14': {
    improving: [75, 78, 80, 82, 85, 88],
    stable: [85, 86, 84, 86, 87, 88],
    challenging: [70, 72, 74, 76, 78, 80],
  },
  // KPI 15: Patient Falls (target: 1.0 per 1000 patient days, lower is better) - Zero incidents
  'kpi-15': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
  // KPI 16: Needlestick Injuries (target: 1.0 per 100 occupied beds, lower is better) - Zero incidents
  'kpi-16': {
    improving: [0, 0, 0, 0, 0, 0],
    stable: [0, 0, 0, 0, 0, 0],
    challenging: [0, 0, 0, 0, 0, 0],
  },
};

// Generate data using predefined realistic scenarios
export function generateKPIDataFromScenario(
  kpiId: string,
  scenario: 'improving' | 'stable' | 'challenging' = 'improving'
): KPIDataEntry[] {
  const kpi = NABH_KPIS.find(k => k.id === kpiId);
  if (!kpi) return [];

  const months = getLastSixMonths();
  const scenarioData = KPI_DATA_SCENARIOS[kpiId]?.[scenario];

  if (!scenarioData) {
    return generateKPIData(kpi);
  }

  return months.map((month, index) => {
    const value = scenarioData[index];

    // Generate numerator and denominator
    let numerator: number | undefined;
    let denominator: number | undefined;

    if (kpi.unit === 'Percentage') {
      denominator = Math.floor(Math.random() * 200) + 100;
      numerator = Math.round((value / 100) * denominator);
    } else if (kpi.unit.includes('1000')) {
      denominator = Math.floor(Math.random() * 500) + 200;
      numerator = Math.round((value / 1000) * denominator);
    } else if (kpi.unit.includes('100')) {
      denominator = Math.floor(Math.random() * 100) + 50;
      numerator = Math.round((value / 100) * denominator);
    }

    return {
      month,
      value,
      target: kpi.suggestedTarget,
      numeratorValue: numerator,
      denominatorValue: denominator,
      remarks: generateRemarks(kpi, value, index),
    };
  });
}

// Generate and save all KPIs with improving scenario
export function generateAllKPIDataWithScenario(
  scenario: 'improving' | 'stable' | 'challenging' = 'improving'
): Record<string, KPIDataEntry[]> {
  const allData: Record<string, KPIDataEntry[]> = {};

  NABH_KPIS.forEach(kpi => {
    allData[kpi.id] = generateKPIDataFromScenario(kpi.id, scenario);
  });

  return allData;
}
