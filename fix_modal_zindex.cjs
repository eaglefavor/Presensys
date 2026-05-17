const fs = require('fs');

let content = fs.readFileSync('src/pages/Students.tsx', 'utf8');

// The bottom sheet in Students.tsx has zIndex 2001. We need to make sure the modal backdrop has higher.
// SetPinModal zIndex is 2050. This should be fine. But let's check if the modal is hidden behind something.
