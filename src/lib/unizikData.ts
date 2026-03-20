/**
 * UNIZIK Faculty, Department, and Level data.
 * Source: Nnamdi Azikiwe University official academic structure.
 */

export interface Faculty {
  name: string;
  departments: string[];
}

export const FACULTIES: Faculty[] = [
  {
    name: 'Faculty of Agriculture',
    departments: [
      'Agricultural Economics & Extension',
      'Animal Science & Technology',
      'Crop Science & Horticulture',
      'Fisheries & Aquaculture',
      'Food Science & Technology',
      'Forestry & Wildlife Management',
      'Soil Science & Land Resources',
    ],
  },
  {
    name: 'Faculty of Arts',
    departments: [
      'Chinese',
      'English Language & Literature',
      'History & International Studies',
      'Igbo, African & Asian Studies',
      'Linguistics',
      'Modern European Languages',
      'Music',
      'Philosophy',
      'Religion & Human Relations',
      'Theatre Arts',
    ],
  },
  {
    name: 'Faculty of Basic Clinical Sciences',
    departments: [
      'Surgery',
      'Internal Medicine',
      'Clinical Training Rotations',
    ],
  },
  {
    name: 'Faculty of Basic Medical Sciences',
    departments: [
      'Anatomy',
      'Human Physiology',
      'Human Biochemistry',
    ],
  },
  {
    name: 'Faculty of Biosciences',
    departments: [
      'Applied Biochemistry',
      'Applied Microbiology & Brewing',
      'Botany',
      'Parasitology & Entomology',
      'Zoology',
    ],
  },
  {
    name: 'Faculty of Education',
    departments: [
      'Adult Education',
      'Early Childhood & Primary Education',
      'Educational Foundation',
      'Educational Management & Policy',
      'Guidance & Counseling',
      'Human Kinetics & Health Education',
      'Science Education',
      'Vocational Education',
      'Library & Information Science',
    ],
  },
  {
    name: 'Faculty of Engineering',
    departments: [
      'Agricultural & Bioresources Engineering',
      'Chemical Engineering',
      'Civil Engineering',
      'Electrical Engineering',
      'Electronic & Computer Engineering',
      'Industrial & Production Engineering',
      'Mechanical Engineering',
      'Metallurgical & Materials Engineering',
      'Polymer & Textile Engineering',
      'Petroleum Engineering',
    ],
  },
  {
    name: 'Faculty of Environmental Sciences',
    departments: [
      'Architecture',
      'Building',
      'Environmental Management',
      'Estate Management',
      'Fine & Applied Arts',
      'Geography & Meteorology',
      'Quantity Surveying',
      'Surveying & Geoinformatics',
      'Interior Architecture & Design',
    ],
  },
  {
    name: 'Faculty of Health Sciences & Technology',
    departments: [
      'Environmental Health Sciences',
      'Human Nutrition & Dietetics',
      'Medical Rehabilitation (Physiotherapy)',
      'Nursing Science',
      'Radiography & Radiological Sciences',
    ],
  },
  {
    name: 'Faculty of Law',
    departments: [
      'Civil Law',
      'Commercial Law',
      'International Law',
      'Public Law',
    ],
  },
  {
    name: 'Faculty of Management Sciences',
    departments: [
      'Accountancy',
      'Banking & Finance',
      'Business Administration',
      'Cooperative Economics & Management',
      'Marketing',
      'Public Administration',
      'Entrepreneurial Studies',
      'Logistics & Supply Chain Management',
      'Procurement Management',
      'Insurance',
    ],
  },
  {
    name: 'Faculty of Medicine',
    departments: [
      'Medicine & Surgery (MBBS)',
      'Bachelor of Dental Surgery (B.D.S)',
    ],
  },
  {
    name: 'Faculty of Medical Laboratory Sciences',
    departments: [
      'Clinical Chemistry',
      'Haematology & Blood Transfusion',
      'Histopathology',
      'Immunology & Immunochemistry',
      'Medical Microbiology & Public Health',
    ],
  },
  {
    name: 'Faculty of Pharmaceutical Sciences',
    departments: [
      'Pharmaceutical & Medicinal Chemistry',
      'Pharmaceutics & Pharmaceutical Technology',
      'Pharmacognosy & Traditional Medicine',
      'Pharmacology & Toxicology',
      'Pharmaceutical Microbiology & Biotechnology',
    ],
  },
  {
    name: 'Faculty of Physical Sciences',
    departments: [
      'Computer Science',
      'Geological Sciences',
      'Geophysics',
      'Mathematics',
      'Physics & Industrial Physics',
      'Pure & Industrial Chemistry',
      'Statistics',
    ],
  },
  {
    name: 'Faculty of Social Sciences',
    departments: [
      'Economics',
      'Mass Communication',
      'Political Science',
      'Psychology',
      'Sociology & Anthropology',
      'Journalism & Media Studies',
      'Broadcasting',
    ],
  },
  {
    name: 'Faculty of Technology & Vocational Education',
    departments: [
      'Technical Education',
      'Vocational Education',
    ],
  },
];

export const LEVELS = [
  '100 Level',
  '200 Level',
  '300 Level',
  '400 Level',
  '500 Level',
  '600 Level',
];

/**
 * Get departments for a given faculty name.
 */
export function getDepartments(facultyName: string): string[] {
  const faculty = FACULTIES.find(f => f.name === facultyName);
  return faculty?.departments || [];
}
