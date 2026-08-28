/* Configuração da sincronização (Supabase).
 *
 * Preencha os dois valores abaixo com os dados do seu projeto:
 *   url  -> Settings > Data API > Project URL
 *   key  -> Settings > API Keys > a chave "anon" / "public" / "publishable"
 *
 * NUNCA coloque aqui a chave "service_role" / "secret": ela ignora as regras
 * de segurança do banco. A chave anon é pública por desenho — quem protege
 * os dados é o Row Level Security, que já está ligado na tabela "calculos".
 *
 * Deixando os dois vazios, o app funciona normalmente, só sem sincronizar.
 */
window.CALC3D_CONFIG = {
  url: "https://tduvbmmcumkknluooqyn.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkdXZibW1jdW1ra25sdW9vcXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDA2MTksImV4cCI6MjEwMzUxNjYxOX0.NA0fZlWF5Ko4Gt_Aq6XIBgow6b7Tkmzi2C-rX9qlL-s"
};
