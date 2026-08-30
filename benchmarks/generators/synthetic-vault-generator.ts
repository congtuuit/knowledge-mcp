import fs from "node:fs";
import path from "node:path";

export interface GroundTruthItem {
  id: string;
  category: "single_hop" | "multi_hop" | "blast_radius" | "conflict" | "ownership" | "exact_code";
  query: string;
  expectedFiles?: string[];
  expectedEntities?: string[];
  expectedPath?: string[];
  expectedOwner?: string;
  expectedConflicts?: string[];
  targetEntity?: string;
  description: string;
}

export interface SyntheticVaultConfig {
  outputDir: string;
  groundTruthFile: string;
  scale?: "micro" | "standard" | "enterprise"; // micro: ~30 files, standard: ~500 files, enterprise: ~1,500 files
  targetFileCount?: number;
}

/**
 * Sinh bộ dữ liệu synthetic enterprise theo chuẩn quy mô Tier 1 (micro) hoặc Tier 2 (standard ~500-1000 files).
 */
export function generateSyntheticVault(config: SyntheticVaultConfig): {
  totalFiles: number;
  groundTruthCount: number;
} {
  const {
    outputDir,
    groundTruthFile,
    scale = "standard",
    targetFileCount = scale === "micro" ? 30 : scale === "enterprise" ? 1500 : 500,
  } = config;

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const servicesDir = path.join(outputDir, "services");
  const policiesDir = path.join(outputDir, "policies");
  const schemasDir = path.join(outputDir, "schemas");
  const adrsDir = path.join(outputDir, "architecture");
  const teamsDir = path.join(outputDir, "teams");

  fs.mkdirSync(servicesDir, { recursive: true });
  fs.mkdirSync(policiesDir, { recursive: true });
  fs.mkdirSync(schemasDir, { recursive: true });
  fs.mkdirSync(adrsDir, { recursive: true });
  fs.mkdirSync(teamsDir, { recursive: true });

  const groundTruth: GroundTruthItem[] = [];

  // ==========================================
  // 1. Teams (10 Domains)
  // ==========================================
  const teams = [
    { id: "TeamCoreCommerce", name: "Team Core Commerce", lead: "Alice Nguyen", domain: "Order & Checkout" },
    { id: "TeamPayments", name: "Team Payments", lead: "Bob Tran", domain: "Payment Gateway & Billing" },
    { id: "TeamAuthSecurity", name: "Team Auth & Security", lead: "Charlie Le", domain: "Identity & Access" },
    { id: "TeamDataPlatform", name: "Team Data Platform", lead: "David Pham", domain: "Data Lake & ETL" },
    { id: "TeamSecOps", name: "Team SecOps", lead: "Eve Hoang", domain: "Security Operations & Compliance" },
    { id: "TeamHRPeople", name: "Team HR & People", lead: "Grace Vo", domain: "Human Resources & Payroll" },
    { id: "TeamLogistics", name: "Team Logistics", lead: "Henry Dang", domain: "Shipping & Fulfillment" },
    { id: "TeamDevOps", name: "Team DevOps & SRE", lead: "Ian Bui", domain: "Kubernetes & Infrastructure" },
    { id: "TeamSearchAI", name: "Team Search & AI", lead: "Julia Vu", domain: "Semantic Search & Recommendations" },
    { id: "TeamFinanceBilling", name: "Team Finance & Invoicing", lead: "Kevin Ngo", domain: "Tax & Financial Reporting" },
  ];

  for (const team of teams) {
    const filePath = path.join(teamsDir, `${team.id}.md`);
    const content = `---
id: ${team.id}
title: ${JSON.stringify(team.name + " Overview")}
type: team
owner: ${team.lead}
domain: ${team.domain}
---

# ${team.name}

Team phụ trách toàn bộ mảng **${team.domain}**.
Lead phụ trách: ${team.lead}
Kênh Slack: #team-${team.id.toLowerCase()}

## Trách nhiệm chính
- Duy trì tính ổn định SLA 99.99% cho các microservices thuộc miền ${team.domain}.
- Phản hồi sự cố P1 trong vòng 15 phút.
- Quản lý kiến trúc và code review định kỳ.
`;
    fs.writeFileSync(filePath, content, "utf8");
  }

  // ==========================================
  // 2. Database Schemas & Stores (Dynamically scaled)
  // ==========================================
  const baseSchemas = [
    { id: "UserSchema", table: "users", owner: "TeamAuthSecurity", pii: true, desc: "Bảng lưu trữ tài khoản người dùng và mật khẩu băm." },
    { id: "OrderSchema", table: "orders", owner: "TeamCoreCommerce", pii: false, desc: "Bảng quản lý đơn đặt hàng và trạng thái đơn." },
    { id: "PaymentTransactionSchema", table: "transactions", owner: "TeamPayments", pii: true, desc: "Bảng nhật ký giao dịch tài chính và mã token thẻ." },
    { id: "InventorySchema", table: "inventory_items", owner: "TeamCoreCommerce", pii: false, desc: "Bảng quản lý số lượng tồn kho theo SKU." },
    { id: "AuditLogSchema", table: "audit_logs", owner: "TeamSecOps", pii: false, desc: "Bảng lưu vết truy cập và thay đổi quyền của hệ thống." },
    { id: "EmployeePayrollSchema", table: "payrolls", owner: "TeamHRPeople", pii: true, desc: "Bảng lương và phúc lợi nhân sự nội bộ." },
    { id: "ShipmentTrackingSchema", table: "shipments", owner: "TeamLogistics", pii: false, desc: "Bảng theo dõi hành trình giao nhận hàng." },
    { id: "InvoiceTaxSchema", table: "invoices", owner: "TeamFinanceBilling", pii: true, desc: "Bảng hóa đơn đỏ điện tử và tính thuế VAT." },
    { id: "SearchIndexCacheSchema", table: "search_cache", owner: "TeamSearchAI", pii: false, desc: "Bảng đệm kết quả tìm kiếm và embeddings." },
    { id: "ClusterMetricsSchema", table: "k8s_metrics", owner: "TeamDevOps", pii: false, desc: "Bảng giám sát tài nguyên CPU, RAM cụm máy chủ." },
  ];

  const numSchemasToGen = scale === "micro" ? 6 : Math.max(10, Math.floor(targetFileCount * 0.2));
  const generatedSchemas: Array<{ id: string; table: string; owner: string; pii: boolean; desc: string }> = [];

  for (let i = 0; i < numSchemasToGen; i++) {
    if (i < baseSchemas.length) {
      generatedSchemas.push(baseSchemas[i]);
    } else {
      const parentTeam = teams[i % teams.length];
      const schemaId = `SchemaExt${i}_${parentTeam.id.replace("Team", "")}`;
      const tableName = `table_ext_${i}_${parentTeam.id.toLowerCase()}`;
      generatedSchemas.push({
        id: schemaId,
        table: tableName,
        owner: parentTeam.id,
        pii: i % 3 === 0,
        desc: `Bảng dữ liệu mở rộng phục vụ dịch vụ phụ trợ ${i} của ${parentTeam.domain}.`,
      });
    }
  }

  for (const s of generatedSchemas) {
    const filePath = path.join(schemasDir, `${s.id}.md`);
    const content = `---
id: ${s.id}
title: ${JSON.stringify("Schema " + s.table)}
type: schema
owner: ${s.owner}
table_name: ${s.table}
is_pii: ${s.pii}
---

# Schema Specification: ${s.table}

${s.desc}
Đội ngũ quản lý: [[${s.owner}]]

## Cấu trúc cột chính
- \`id\` (UUID, Primary Key)
- \`created_at\` (TIMESTAMP WITH TIME ZONE)
- \`updated_at\` (TIMESTAMP WITH TIME ZONE)
- \`status_code\` (VARCHAR(32))
- \`payload_checksum\` (VARCHAR(64))

## Bảo mật & Tuân thủ
${s.pii ? "⚠️ Cảnh báo: Bảng này chứa dữ liệu PII nhạy cảm, bắt buộc mã hóa cột at-rest bằng AES-256." : "Bảng dữ liệu phi PII thông thường."}
`;
    fs.writeFileSync(filePath, content, "utf8");
  }

  // ==========================================
  // 3. Microservices & Dependency DAG (Multi-hop chains)
  // ==========================================
  const numServicesToGen = scale === "micro" ? 8 : Math.max(12, Math.floor(targetFileCount * 0.35));
  const generatedServices: Array<{
    id: string;
    type: "api" | "service";
    owner: string;
    dependsOn: string[];
    implements: string[];
    references: string[];
    codeToken: string;
    description: string;
  }> = [];

  // Chuỗi cốt lõi: CheckoutAPI -> OrderService -> PaymentService -> StripeGateway -> PaymentTransactionSchema
  generatedServices.push(
    {
      id: "CheckoutAPI",
      type: "api",
      owner: "TeamCoreCommerce",
      dependsOn: ["OrderService", "AuthGateway"],
      implements: [],
      references: ["UserSchema"],
      codeToken: "ERR_CHECKOUT_CART_LOCKED_881",
      description: "Gateway REST API tiếp nhận yêu cầu đặt hàng từ Web và Mobile App.",
    },
    {
      id: "OrderService",
      type: "service",
      owner: "TeamCoreCommerce",
      dependsOn: ["PaymentService", "InventoryService", "ShippingService"],
      implements: ["OrderSchema"],
      references: ["AuditLogSchema"],
      codeToken: "ORDER_STATE_MACHINE_TRANSITION_FAILED_502",
      description: "Core microservice xử lý luồng tạo đơn, hủy đơn, giảm tồn kho và tính thuế.",
    },
    {
      id: "InventoryService",
      type: "service",
      owner: "TeamCoreCommerce",
      dependsOn: ["InventorySchema"],
      implements: ["InventorySchema"],
      references: [],
      codeToken: "ERR_STOCK_RESERVATION_TIMEOUT_408",
      description: "Dịch vụ giữ hàng và đồng bộ số lượng tồn kho thời gian thực.",
    },
    {
      id: "PaymentService",
      type: "service",
      owner: "TeamPayments",
      dependsOn: ["StripeGateway", "PaymentTransactionSchema", "InvoiceService"],
      implements: ["PaymentTransactionSchema"],
      references: ["AuditLogSchema"],
      codeToken: "ERR_PAYMENT_IDEMPOTENCY_KEY_COLLISION_409",
      description: "Dịch vụ thanh toán tập trung, hỗ trợ Credit Card, Momo, VNPay.",
    },
    {
      id: "StripeGateway",
      type: "service",
      owner: "TeamPayments",
      dependsOn: ["PaymentTransactionSchema"],
      implements: [],
      references: [],
      codeToken: "STRIPE_WEBHOOK_SIGNATURE_VERIFICATION_FAIL_993",
      description: "Adapter tích hợp trực tiếp với Stripe API v2026.",
    },
    {
      id: "AuthGateway",
      type: "service",
      owner: "TeamAuthSecurity",
      dependsOn: ["UserService", "UserSchema"],
      implements: [],
      references: ["AuditLogSchema"],
      codeToken: "ERR_AUTH_EXPIRED_SESSION_TOKEN_991",
      description: "Dịch vụ xác thực JWT và phân quyền RBAC toàn hệ thống.",
    },
    {
      id: "UserService",
      type: "service",
      owner: "TeamAuthSecurity",
      dependsOn: ["UserSchema"],
      implements: ["UserSchema"],
      references: [],
      codeToken: "ERR_USER_NOT_FOUND_OR_DEACTIVATED_404",
      description: "Quản lý thông tin profile, credentials và MFA của người dùng.",
    },
    {
      id: "SecurityAlertService",
      type: "service",
      owner: "TeamSecOps",
      dependsOn: ["AuditLogSchema"],
      implements: ["AuditLogSchema"],
      references: [],
      codeToken: "SEC_ANOMALOUS_TRAFFIC_BURST_DETECTED_771",
      description: "Hệ thống phát hiện xâm nhập và cảnh báo bất thường.",
    },
    {
      id: "ShippingService",
      type: "service",
      owner: "TeamLogistics",
      dependsOn: ["ShipmentTrackingSchema"],
      implements: ["ShipmentTrackingSchema"],
      references: [],
      codeToken: "ERR_CARRIER_API_RATE_LIMIT_EXCEEDED_429",
      description: "Dịch vụ liên kết các đơn vị vận chuyển ViettelPost, GHN, GHTK.",
    },
    {
      id: "InvoiceService",
      type: "service",
      owner: "TeamFinanceBilling",
      dependsOn: ["InvoiceTaxSchema"],
      implements: ["InvoiceTaxSchema"],
      references: [],
      codeToken: "ERR_VAT_INVOICE_GENERATION_FAILED_503",
      description: "Dịch vụ phát hành hóa đơn VAT điện tử tự động.",
    }
  );

  // Mở rộng thêm các service theo DAG liên kết chéo
  for (let i = generatedServices.length; i < numServicesToGen; i++) {
    const parentTeam = teams[i % teams.length];
    const prevService = generatedServices[(i - 1) % generatedServices.length];
    const relatedSchema = generatedSchemas[i % generatedSchemas.length];
    const svcId = `Microservice_${parentTeam.id.replace("Team", "")}_${i}`;

    generatedServices.push({
      id: svcId,
      type: i % 4 === 0 ? "api" : "service",
      owner: parentTeam.id,
      dependsOn: [prevService.id, relatedSchema.id],
      implements: [relatedSchema.id],
      references: ["AuditLogSchema"],
      codeToken: `ERR_AUTO_GENERATED_SVC_${i}_TOKEN_CODE`,
      description: `Microservice phụ trợ phục vụ nghiệp vụ ${i} của nhóm ${parentTeam.name}.`,
    });
  }

  for (const s of generatedServices) {
    const filePath = path.join(servicesDir, `${s.id}.md`);
    const yamlDependsOn = s.dependsOn.length > 0 ? `\ndepends_on:\n${s.dependsOn.map((d) => `  - ${d}`).join("\n")}` : "";
    const yamlImplements = s.implements.length > 0 ? `\nimplements:\n${s.implements.map((d) => `  - ${d}`).join("\n")}` : "";
    const yamlReferences = s.references.length > 0 ? `\nreferences:\n${s.references.map((d) => `  - ${d}`).join("\n")}` : "";

    const content = `---
id: ${s.id}
title: ${JSON.stringify(s.id + " Specification")}
type: ${s.type}
owner: ${s.owner}${yamlDependsOn}${yamlImplements}${yamlReferences}
---

# ${s.id}

${s.description}
Phụ trách bởi: [[${s.owner}]]

## Kiến trúc Phụ thuộc
${s.dependsOn.map((d) => `- Phụ thuộc: [[${d}]]`).join("\n")}
${s.implements.map((d) => `- Triển khai schema: [[${d}]]`).join("\n")}
${s.references.map((d) => `- Tham chiếu: [[${d}]]`).join("\n")}

## Mã lỗi chuẩn (Error Codes)
- \`${s.codeToken}\`: Mã lỗi đặc trưng phát sinh khi thực thi.

## API Endpoint
- \`POST /api/v1/${s.id.toLowerCase()}/execute\`
- Header: \`X-Request-Id\`, \`Authorization: Bearer <TOKEN>\`
`;
    fs.writeFileSync(filePath, content, "utf8");
  }

  // ==========================================
  // 4. Enterprise Policies, SOPs & Conflicts
  // ==========================================
  const numPoliciesToGen = scale === "micro" ? 5 : Math.max(8, Math.floor(targetFileCount * 0.25));
  const generatedPolicies: Array<{
    id: string;
    title: string;
    owner: string;
    conflictsWith?: string[];
    supersedes?: string[];
    content: string;
  }> = [
    {
      id: "SOP-Remote-Work-2024",
      title: "Chính sách Làm việc Từ xa 2024",
      owner: "TeamHRPeople",
      conflictsWith: ["SOP-Mandatory-Office-2026"],
      content: "Nhân viên được phép làm việc từ xa tối đa 4 ngày/tuần không cần phê duyệt trước.",
    },
    {
      id: "SOP-Remote-Work-2026",
      title: "Chính sách Làm việc Linh hoạt Hybrid 2026",
      owner: "TeamHRPeople",
      supersedes: ["SOP-Remote-Work-2024"],
      content: "Quy định làm việc Hybrid: tối thiểu 3 ngày có mặt tại văn phòng, 2 ngày WFH.",
    },
    {
      id: "SOP-Mandatory-Office-2026",
      title: "Quy định Làm việc Tập trung Onsite Dự án Khẩn cấp",
      owner: "TeamHRPeople",
      conflictsWith: ["SOP-Remote-Work-2024"],
      content: "Đối với các dự án P0, toàn bộ nhân sự bắt buộc 100% làm việc trực tiếp tại Onsite.",
    },
    {
      id: "SOP-Password-Policy-V1",
      title: "Chính sách Mật khẩu 2023",
      owner: "TeamSecOps",
      content: "Mật khẩu tối thiểu 8 ký tự, đổi mỗi 90 ngày một lần.",
    },
    {
      id: "SOP-Passwordless-Auth-2026",
      title: "Tiêu chuẩn Xác thực Không Mật khẩu FIDO2 2026",
      owner: "TeamSecOps",
      supersedes: ["SOP-Password-Policy-V1"],
      content: "Chuyển đổi toàn bộ tài khoản sang Passkeys / FIDO2 WebAuthn, loại bỏ hoàn toàn mật khẩu văn bản.",
    },
  ];

  for (let i = generatedPolicies.length; i < numPoliciesToGen; i++) {
    const parentTeam = teams[i % teams.length];
    const prevPol = generatedPolicies[(i - 2) % generatedPolicies.length];
    const polId = `SOP_Policy_${parentTeam.id.replace("Team", "")}_${i}`;

    generatedPolicies.push({
      id: polId,
      title: `Quy trình Vận hành Tiêu chuẩn ${i} (${parentTeam.domain})`,
      owner: parentTeam.id,
      supersedes: i % 3 === 0 && prevPol ? [prevPol.id] : undefined,
      content: `Quy định chuẩn hóa quy trình ${i} của nhóm ${parentTeam.name} nhằm đảm bảo tính bảo mật và tuân thủ.`,
    });
  }

  for (const p of generatedPolicies) {
    const filePath = path.join(policiesDir, `${p.id}.md`);
    const yamlSupersedes = p.supersedes && p.supersedes.length > 0 ? `\nsupersedes:\n${p.supersedes.map((s) => `  - ${s}`).join("\n")}` : "";
    const yamlConflicts = p.conflictsWith && p.conflictsWith.length > 0 ? `\nconflicts_with:\n${p.conflictsWith.map((c) => `  - ${c}`).join("\n")}` : "";

    const content = `---
id: ${p.id}
title: ${JSON.stringify(p.title)}
type: document
owner: ${p.owner}${yamlSupersedes}${yamlConflicts}
---

# ${p.title}

Đơn vị ban hành: [[${p.owner}]]

## Nội dung quy chế
${p.content}

## Quy chuẩn & Ràng buộc
- Mọi nhân viên và hệ thống phải tuân thủ nghiêm ngặt theo hướng dẫn.
- Khi có xung đột quy định, ưu tiên phiên bản mới nhất được phê duyệt.
`;
    fs.writeFileSync(filePath, content, "utf8");
  }

  // ==========================================
  // 5. Architecture Decision Records (ADRs)
  // ==========================================
  const numAdrsToGen = scale === "micro" ? 3 : Math.max(6, Math.floor(targetFileCount * 0.2));
  const baseAdrs = [
    {
      id: "ADR-001-SQLite-Native",
      title: "Sử dụng Node.js SQLite Native DatabaseSync cho Knowledge Base",
      owner: "TeamDataPlatform",
      status: "Accepted",
      content: "Lựa chọn node:sqlite tích hợp sẵn từ Node 22 để loại bỏ node-gyp compile và phụ thuộc C++ ngoài.",
    },
    {
      id: "ADR-002-Reciprocal-Rank-Fusion",
      title: "Thuật toán Hybrid Search RRF k=60",
      owner: "TeamDataPlatform",
      status: "Accepted",
      content: "Kết hợp BM25 sparse rank và Cosine dense rank qua công thức 1 / (60 + rank).",
    },
    {
      id: "ADR-003-In-Process-File-Lock",
      title: "Bảo vệ Concurrency Ghi Note bằng withFileLock Promise Queue",
      owner: "TeamAuthSecurity",
      status: "Accepted",
      content: "Khóa tuần tự theo filePath trên bộ nhớ tiến trình để chống lost-update khi nhiều agent ghi đồng thời.",
    },
    {
      id: "ADR-004-Event-Driven-Architecture",
      title: "Kiến trúc Giao tiếp Bất đồng bộ qua Kafka Message Broker",
      owner: "TeamCoreCommerce",
      status: "Accepted",
      content: "Tách rời CheckoutAPI và PaymentService bằng cách sử dụng Kafka Event Streaming.",
    },
    {
      id: "ADR-005-Zero-Token-Graph-Extraction",
      title: "Trích xuất Đồ thị Tri thức Zero-Token từ Markdown AST",
      owner: "TeamSearchAI",
      status: "Accepted",
      content: "Tự động phân tích YAML Frontmatter và [[wikilinks]] mà không tiêu tốn token LLM API.",
    },
  ];

  const generatedAdrs: Array<{ id: string; title: string; owner: string; status: string; content: string }> = [];
  for (let i = 0; i < numAdrsToGen; i++) {
    if (i < baseAdrs.length) {
      generatedAdrs.push(baseAdrs[i]);
    } else {
      const parentTeam = teams[i % teams.length];
      generatedAdrs.push({
        id: `ADR-${String(i + 1).padStart(3, "0")}-SystemDecision-${parentTeam.id.replace("Team", "")}`,
        title: `Quyết định Kiến trúc Số ${i + 1}: Chuẩn hóa Môi trường ${parentTeam.domain}`,
        owner: parentTeam.id,
        status: "Accepted",
        content: `Tối ưu hóa thiết kế hệ thống cho miền ${parentTeam.domain} đảm bảo mở rộng cao và độ trễ thấp.`,
      });
    }
  }

  for (const adr of generatedAdrs) {
    const filePath = path.join(adrsDir, `${adr.id}.md`);
    const content = `---
id: ${adr.id}
title: ${JSON.stringify(adr.title)}
type: document
owner: ${adr.owner}
status: ${adr.status}
---

# ${adr.title}

Trạng thái: **${adr.status}**
Chủ trì: [[${adr.owner}]]

## Bối cảnh & Động lực
${adr.content}

## Hệ quả & Đánh giá
- Tăng tốc độ truy xuất dưới 5ms.
- Triệt tiêu lỗi xung đột đồng thời và đơn giản hóa môi trường triển khai.
`;
    fs.writeFileSync(filePath, content, "utf8");
  }

  // ==========================================
  // 6. GENERATE GROUND TRUTH BENCHMARK DATASET (Scale-aware)
  // ==========================================

  // 6.1 Single-hop Fact Retrieval
  groundTruth.push(
    {
      id: "GT-SH-01",
      category: "single_hop",
      query: "Cơ chế khóa tuần tự ghi file chống race condition sử dụng giải pháp gì?",
      expectedFiles: ["architecture/ADR-003-In-Process-File-Lock.md"],
      expectedEntities: ["ADR-003-In-Process-File-Lock"],
      description: "Tìm kiếm tài liệu ADR về in-process file lock.",
    },
    {
      id: "GT-SH-02",
      category: "single_hop",
      query: "Bảng dữ liệu PII nhạy cảm users yêu cầu mã hóa thế nào?",
      expectedFiles: ["schemas/UserSchema.md"],
      expectedEntities: ["UserSchema"],
      description: "Tìm kiếm quy định mã hóa PII bảng users.",
    },
    {
      id: "GT-SH-03",
      category: "single_hop",
      query: "Công thức kết hợp Hybrid Search RRF sử dụng hằng số k bằng bao nhiêu?",
      expectedFiles: ["architecture/ADR-002-Reciprocal-Rank-Fusion.md"],
      expectedEntities: ["ADR-002-Reciprocal-Rank-Fusion"],
      description: "Tìm kiếm thông số k=60 của RRF.",
    },
    {
      id: "GT-SH-04",
      category: "single_hop",
      query: "Kiến trúc trích xuất đồ thị tri thức không tiêu tốn token LLM API",
      expectedFiles: ["architecture/ADR-005-Zero-Token-Graph-Extraction.md"],
      expectedEntities: ["ADR-005-Zero-Token-Graph-Extraction"],
      description: "Tìm kiếm tài liệu ADR về zero-token extraction.",
    }
  );

  // 6.2 Exact Code / Error Token Retrieval
  groundTruth.push(
    {
      id: "GT-EC-01",
      category: "exact_code",
      query: "ERR_AUTH_EXPIRED_SESSION_TOKEN_991",
      expectedFiles: ["services/AuthGateway.md"],
      expectedEntities: ["AuthGateway"],
      description: "Tìm kiếm service phát sinh mã lỗi hết hạn session token.",
    },
    {
      id: "GT-EC-02",
      category: "exact_code",
      query: "STRIPE_WEBHOOK_SIGNATURE_VERIFICATION_FAIL_993",
      expectedFiles: ["services/StripeGateway.md"],
      expectedEntities: ["StripeGateway"],
      description: "Tìm kiếm adapter webhook Stripe có mã lỗi xác thực chữ ký.",
    },
    {
      id: "GT-EC-03",
      category: "exact_code",
      query: "ERR_STOCK_RESERVATION_TIMEOUT_408",
      expectedFiles: ["services/InventoryService.md"],
      expectedEntities: ["InventoryService"],
      description: "Tìm kiếm dịch vụ InventoryService phát sinh timeout giữ hàng.",
    },
    {
      id: "GT-EC-04",
      category: "exact_code",
      query: "ERR_VAT_INVOICE_GENERATION_FAILED_503",
      expectedFiles: ["services/InvoiceService.md"],
      expectedEntities: ["InvoiceService"],
      description: "Tìm kiếm lỗi phát hành hóa đơn VAT điện tử.",
    }
  );

  // 6.3 Multi-hop Lineage Queries (2-hop to 4-hop)
  groundTruth.push(
    {
      id: "GT-MH-01",
      category: "multi_hop",
      query: "Truy vết chuỗi phụ thuộc từ CheckoutAPI đến PaymentTransactionSchema qua OrderService và PaymentService",
      targetEntity: "CheckoutAPI",
      expectedEntities: ["OrderService", "PaymentService", "PaymentTransactionSchema"],
      description: "Multi-hop traversal 3-hops từ CheckoutAPI đến PaymentTransactionSchema.",
    },
    {
      id: "GT-MH-02",
      category: "multi_hop",
      query: "Dịch vụ CheckoutAPI phụ thuộc vào những service nào để xác thực người dùng và lưu trữ dữ liệu?",
      targetEntity: "CheckoutAPI",
      expectedEntities: ["AuthGateway", "UserService", "UserSchema"],
      description: "Multi-hop lineage qua đường xác thực người dùng.",
    },
    {
      id: "GT-MH-03",
      category: "multi_hop",
      query: "Luồng đặt hàng OrderService phụ thuộc vào các dịch vụ và schema hạ tầng nào?",
      targetEntity: "OrderService",
      expectedEntities: ["PaymentService", "InventoryService", "ShippingService", "OrderSchema"],
      description: "Multi-hop lineage mở rộng từ OrderService.",
    }
  );

  // 6.4 Blast Radius / Impact Analysis Queries
  groundTruth.push(
    {
      id: "GT-BR-01",
      category: "blast_radius",
      query: "Nếu thay đổi cấu trúc bảng PaymentTransactionSchema, những dịch vụ nào nằm trong bán kính ảnh hưởng (Blast Radius)?",
      targetEntity: "PaymentTransactionSchema",
      expectedEntities: ["StripeGateway", "PaymentService", "OrderService", "CheckoutAPI"],
      description: "Tính toán toàn bộ blast radius thượng nguồn khi thay đổi Payment DB.",
    },
    {
      id: "GT-BR-02",
      category: "blast_radius",
      query: "Nếu PaymentService ngừng hoạt động, những hệ thống nào bị ảnh hưởng gián tiếp và trực tiếp?",
      targetEntity: "PaymentService",
      expectedEntities: ["OrderService", "CheckoutAPI", "PaymentTransactionSchema", "StripeGateway", "InvoiceService"],
      description: "Phân tích ảnh hưởng khi PaymentService gặp sự cố.",
    },
    {
      id: "GT-BR-03",
      category: "blast_radius",
      query: "Nếu thay đổi UserSchema, các dịch vụ xác thực nào bị ảnh hưởng?",
      targetEntity: "UserSchema",
      expectedEntities: ["UserService", "AuthGateway", "CheckoutAPI"],
      description: "Bán kính ảnh hưởng khi UserSchema bị thay đổi.",
    }
  );

  // 6.5 Conflict & Supersedes Detection
  groundTruth.push(
    {
      id: "GT-CF-01",
      category: "conflict",
      query: "Chính sách làm việc từ xa SOP-Remote-Work-2024 đang mâu thuẫn trực tiếp với quy định nào?",
      targetEntity: "SOP-Remote-Work-2024",
      expectedConflicts: ["SOP-Mandatory-Office-2026", "SOP-Remote-Work-2026"],
      description: "Phát hiện mâu thuẫn CONFLICTS_WITH giữa WFH và Onsite.",
    },
    {
      id: "GT-CF-02",
      category: "conflict",
      query: "Chính sách mật khẩu cũ SOP-Password-Policy-V1 đã bị thay thế bởi tiêu chuẩn nào?",
      targetEntity: "SOP-Password-Policy-V1",
      expectedConflicts: ["SOP-Passwordless-Auth-2026"],
      description: "Phát hiện SUPERSEDES giữa Password và Passkey FIDO2.",
    }
  );

  // 6.6 Ownership Resolution
  groundTruth.push(
    {
      id: "GT-OW-01",
      category: "ownership",
      query: "Đội ngũ kỹ thuật nào chịu trách nhiệm sở hữu và bảo trì PaymentService?",
      targetEntity: "PaymentService",
      expectedOwner: "TeamPayments",
      description: "Truy vết team sở hữu qua OWNED_BY edge.",
    },
    {
      id: "GT-OW-02",
      category: "ownership",
      query: "Team nào là chủ sở hữu của AuthGateway và chính sách bảo mật danh tính?",
      targetEntity: "AuthGateway",
      expectedOwner: "TeamAuthSecurity",
      description: "Truy vết team sở hữu AuthGateway.",
    },
    {
      id: "GT-OW-03",
      category: "ownership",
      query: "Team nào phụ trách quản lý dịch vụ ShippingService?",
      targetEntity: "ShippingService",
      expectedOwner: "TeamLogistics",
      description: "Truy vết team sở hữu ShippingService.",
    }
  );

  // Ghi file ground_truth.json
  fs.mkdirSync(path.dirname(groundTruthFile), { recursive: true });
  fs.writeFileSync(groundTruthFile, JSON.stringify(groundTruth, null, 2), "utf8");

  const totalFiles =
    teams.length +
    generatedSchemas.length +
    generatedServices.length +
    generatedPolicies.length +
    generatedAdrs.length;

  return {
    totalFiles,
    groundTruthCount: groundTruth.length,
  };
}

// Cho phép chạy trực tiếp qua CLI
if (process.argv[1] && process.argv[1].includes("synthetic-vault-generator")) {
  const targetDir = path.resolve("./data/synthetic-vault");
  const gtPath = path.resolve("./benchmarks/datasets/synthetic_ground_truth.json");

  const scaleArg = process.argv.find((a) => a.startsWith("--scale="))?.split("=")[1] as
    | "micro"
    | "standard"
    | "enterprise"
    | undefined;

  const countArg = process.argv.find((a) => a.startsWith("--size="))?.split("=")[1];

  const stats = generateSyntheticVault({
    outputDir: targetDir,
    groundTruthFile: gtPath,
    scale: scaleArg ?? "standard",
    targetFileCount: countArg ? parseInt(countArg, 10) : undefined,
  });

  console.log(`[Generator] Generated ${stats.totalFiles} synthetic markdown files in ${targetDir} (Scale: ${scaleArg ?? "standard"})`);
  console.log(`[Generator] Created ${stats.groundTruthCount} ground truth benchmark test items in ${gtPath}`);
}
