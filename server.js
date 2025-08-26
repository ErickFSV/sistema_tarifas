import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Configuração do pool de conexões MySQL
const dbConfig = {
  host: "52.22.104.75",
  port: 33066,
  user: "bi_transcourierbh",
  password: "2XPiiPnQojkACX9VlHu7N7W63x3HuQb6",
  database: "transcourierbh",
  waitForConnections: true,
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

let db;

try {
  db = await mysql.createPool(dbConfig);
  console.log('✅ Conexão com MySQL estabelecida com sucesso');
} catch (error) {
  console.error('❌ Erro ao conectar com MySQL:', error.message);
  process.exit(1);
}

const baseSubquery = `
  SELECT
    t_faixa.inicio as PESO_MINIMO,
    t_faixa.fim as PESO_FINAL,
    t_faixa.minimo as TARIFA_MINIMA,
    t_faixa.franquia as PESO_CORTE,
    CASE 
      WHEN t_faixa.id_tabela = 524 THEN t_faixa.excedente * 0.3
      ELSE t_faixa.excedente 
    END as TARIFA_EXCEDENTE,

    CASE
      WHEN a1.sigla = "BHZ" THEN "CNF"
      WHEN a1.sigla = "SAO" THEN "CGH"
      WHEN a1.sigla = "VCP" THEN "CPQ"
      WHEN a1.sigla = "RIO" THEN "SDU"
      ELSE a1.sigla
    END AS \`SIGLA ORIGEM\`,

    CASE
      WHEN a2.sigla = "BHZ" THEN "CNF"
      WHEN a2.sigla = "SAO" THEN "CGH"
      WHEN a2.sigla = "VCP" THEN "CPQ"
      WHEN a2.sigla = "RIO" THEN "SDU"
      ELSE a2.sigla 
    END as \`SIGLA DESTINO\`,

    CASE
      WHEN t_faixa.id_tabela = 265 THEN "SOL"
      WHEN t_faixa.id_tabela = 524 THEN "JEM"
      WHEN t_faixa.id_tabela = 275 THEN "LATAM"
      WHEN t_faixa.id_tabela = 280 THEN "GOL"
      WHEN t_faixa.id_tabela = 273 THEN "AZUL"
      ELSE t_frete.nome
    END AS CIA,

    CASE
      WHEN servico = 10 THEN "JEM - CONVENCIONAL"
      WHEN servico = 106 THEN "TRANSFERENCIA + ENTREGA"
      WHEN servico = 107 THEN "POSTJEM"
      WHEN servico = 0 THEN "SOL - CONVENCIONAL"
      WHEN servico = 57 THEN "SOL - RETIRA RODO"
      WHEN servico = 17 THEN "LATAM STANDARD"
      WHEN servico = 18 THEN "LATAM VELOZ"
      WHEN servico = 60 THEN "LATAM - E FACIL"
      WHEN servico = 40 THEN "AZUL 2 HORAS"
      WHEN servico = 41 THEN "AZUL AMANHA"
      WHEN servico = 42 THEN "AZUL STANDARD"
      WHEN servico = 63 THEN "GOL ECONOMICO"
      WHEN servico = 64 THEN "GOL RAPIDO"
      WHEN servico = 67 THEN "GOL RAPIDO FRACIONADO"
      WHEN servico = 66 THEN "GOL SAUDE"
      WHEN servico = 65 THEN "GOL URGENTE"
      WHEN servico = 100 THEN "GOL URGENTE FRACIONADO"
      ELSE 'VERIFICAR COM A PERFORMANCE'
    END AS SERVICO
  FROM tabela_faixas as t_faixa
  LEFT JOIN tabela_frete  as t_frete  on t_faixa.id_tabela = t_frete.id_tabela
  LEFT JOIN tabela_trecho as t_trecho on t_faixa.id_trecho = t_trecho.id_trecho
  LEFT JOIN aero          as a1       on t_trecho.origem   = a1.cidade
  LEFT JOIN aero          as a2       on t_trecho.destino  = a2.cidade
  WHERE
    t_faixa.id_tabela IN (265, 524, 275, 280, 273)
    AND t_trecho.status = 1
    AND a1.sigla IS NOT NULL
    AND a2.sigla IS NOT NULL
    AND servico <> 106
    AND t_trecho.origem <> 3518800
	AND t_trecho.destino <> 3518800
`;

app.get("/opcoes", async (_req, res) => {
  try {
    console.log('Buscando opções de origem e destino...');
    const [rows] = await db.query(`
      SELECT DISTINCT \`SIGLA ORIGEM\` as sigla FROM (${baseSubquery}) q ORDER BY sigla
    `);
    const [rows2] = await db.query(`
      SELECT DISTINCT \`SIGLA DESTINO\` as sigla FROM (${baseSubquery}) q ORDER BY sigla
    `);
    
    console.log(`Encontradas ${rows.length} origens e ${rows2.length} destinos`);
    res.json({ origens: rows.map(r => r.sigla), destinos: rows2.map(r => r.sigla) });
  } catch (error) {
    console.error('Erro ao buscar opções:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.get("/tarifas", async (req, res) => {
  try {
    const { origem, destino } = req.query;
    console.log('Buscando tarifas para:', { origem, destino });

    if (!origem || !destino) {
      return res.status(400).json({ error: "Informe origem e destino" });
    }

    const [rows] = await db.query(
      `
      SELECT * FROM (${baseSubquery}) q
      WHERE q.\`SIGLA ORIGEM\` = ? AND q.\`SIGLA DESTINO\` = ?
      ORDER BY CIA, SERVICO, PESO_MINIMO, PESO_FINAL
      `,
      [origem, destino]
    );
    
    console.log(`Encontradas ${rows.length} tarifas para ${origem}->${destino}`);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar tarifas:', error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static('.'));

const PORT = 3000;
app.listen(PORT, () => {
  console.log("==================================");
  console.log("🚀 API rodando na porta", PORT);
  console.log("📊 Health: http://localhost:3000/health");
  console.log("🌐 Opções: http://localhost:3000/opcoes");
  console.log("💻 Site: http://localhost:3000");
  console.log("==================================");
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada:', reason);
});