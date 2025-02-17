// Fonction de logging personnalisée
export function debugLog(...args: any[]): void {
  console.log(new Date().toISOString(), '-', ...args);
}

export function errorLog(...args: any[]): void {
  console.error(new Date().toISOString(), '- ERROR:', ...args);
}

export function infoLog(...args: any[]): void {
  console.info(new Date().toISOString(), '-', ...args);
}
