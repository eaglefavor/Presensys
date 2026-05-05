import re

with open('src/pages/attendance/SessionsList.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "const lecturers = useLiveQuery(() => db.lecturers.filter(l => l.isDeleted !== 1).toArray()) || [];",
    "const lecturers = useLiveQuery(() => db.lecturers.filter(l => l.isDeleted !== 1).toArray(), []) || [];"
)

with open('src/pages/attendance/SessionsList.tsx', 'w') as f:
    f.write(content)
