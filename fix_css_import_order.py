with open('src/main.tsx', 'r') as f:
    content = f.read()

# Replace the import order
content = content.replace(
    "import './index.css'\nimport 'bootstrap/dist/css/bootstrap.min.css'",
    "import 'bootstrap/dist/css/bootstrap.min.css'\nimport './index.css'"
)

with open('src/main.tsx', 'w') as f:
    f.write(content)
