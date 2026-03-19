import https from 'https';
import fs from 'fs';

const url = 'https://raw.githubusercontent.com/eaglefavor/Presensys/main/src/pages/Auth.tsx';
https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('src/pages/Auth.tsx', data);

        function replaceAll(file, replacements) {
            let content = fs.readFileSync(file, 'utf8');
            for (const [a, b] of replacements) {
                content = content.split(a).join(b);
            }
            fs.writeFileSync(file, content);
        }

        replaceAll('src/pages/Auth.tsx', [
            ["import { supabase } from '../lib/supabase';", "import { supabase } from '../lib/supabase';\nimport toast from 'react-hot-toast';"],
            ["alert('Verification email sent! Check your inbox.');", "toast.success('Verification email sent! Check your inbox.');"]
        ]);

        replaceAll('src/pages/Courses.tsx', [
            ["import { db, type Course } from '../db/db';", "import { db, type Course } from '../db/db';\nimport toast from 'react-hot-toast';"],
            ["alert('Changes saved successfully!');", "toast.success('Changes saved successfully!');"],
            ["alert('Failed to save changes.');", "toast.error('Failed to save changes.');"],
            ["alert('Failed to generate export file.');", "toast.error('Failed to generate export file.');"]
        ]);

        replaceAll('src/pages/Students.tsx', [
            ["import jsPDF from 'jspdf';", "import jsPDF from 'jspdf';\nimport toast from 'react-hot-toast';"],
            ["alert('Reg Number must be exactly 10 digits.');", "toast.error('Reg Number must be exactly 10 digits.');"],
            ["alert(`Invalid Reg Number: ${s.regNumber}. Must be exactly 10 digits.`);", "toast.error(`Invalid Reg Number: ${s.regNumber}. Must be exactly 10 digits.`);"],
            ["alert(`Duplicate in list: ${s.regNumber} appears twice.`);", "toast.error(`Duplicate in list: ${s.regNumber} appears twice.`);"],
            ["alert('Save failed.');", "toast.error('Save failed.');"]
        ]);

        replaceAll('src/components/BarcodeScanner.tsx', [
            ["import { Html5QrcodeScanner } from 'html5-qrcode';", "import { Html5QrcodeScanner } from 'html5-qrcode';\nimport toast from 'react-hot-toast';"],
            ["alert(\"Could not start camera. Please ensure permissions are granted.\");", "toast.error(\"Could not start camera. Please ensure permissions are granted.\");"]
        ]);

        console.log("Toasts Fixed");
    });
}).on('error', err => console.error(err));
