#!/usr/bin/env python3
"""
Test Runner - Executa testes e envia relatório para Telegram
Uso: python run_tests_and_notify.py [--project PROJECT] [--branch BRANCH] [--commit COMMIT]
"""
import os
import sys
import json
import subprocess
import argparse
from datetime import datetime
from pathlib import Path

# Adicionar o diretório do backend ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

# Importar após adicionar ao path
try:
    from app.utils.notifications import send_test_report, send_deploy_success, send_deploy_failed
    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False
    print("Aviso: módulo de notificações não disponível")


def run_command(cmd, cwd=None):
    """Executa comando shell e retorna resultado"""
    print(f"Executando: {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True
    )
    return result


def run_pytest(tests_dir, test_type="unit", coverage=False):
    """Executa pytest com relatório JSON"""
    output_file = f"/tmp/test_report_{test_type}.json"
    
    cmd = [
        "pytest",
        tests_dir,
        f"--json-report",
        f"--json-report-file={output_file}",
        "-v",
        "--tb=short"
    ]
    
    if coverage:
        cmd.extend(["--cov=app", "--cov-report=term-missing"])
    
    result = run_command(" ".join(cmd))
    
    # Tentar ler o relatório JSON
    report_data = None
    if os.path.exists(output_file):
        with open(output_file) as f:
            report_data = json.load(f)
    
    return {
        "output": result.stdout + "\n" + result.stderr,
        "exit_code": result.returncode,
        "report": report_data
    }


def run_e2e_tests(playwright_dir=None):
    """Executa testes E2E com Playwright"""
    output_file = "/tmp/test_report_e2e.json"
    
    # Verificar se Playwright está instalado
    check = run_command("which playwright")
    if check.returncode != 0:
        return {
            "output": "Playwright não instalado",
            "exit_code": 1,
            "report": None
        }
    
    # Executar com report JSON
    cmd = f"playwright test --reporter=json --output={output_file}"
    result = run_command(cmd)
    
    report_data = None
    if os.path.exists(output_file):
        with open(output_file) as f:
            report_data = json.load(f)
    
    return {
        "output": result.stdout + "\n" + result.stderr,
        "exit_code": result.returncode,
        "report": report_data
    }


def parse_pytest_report(report):
    """Extrai métricas do relatório pytest JSON"""
    if not report:
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "duration": 0
        }
    
    summary = report.get("summary", {})
    return {
        "total": summary.get("total", 0),
        "passed": summary.get("passed", 0),
        "failed": summary.get("failed", 0),
        "skipped": summary.get("skipped", 0),
        "duration": report.get("duration", 0)
    }


def parse_playwright_report(report):
    """Extrai métricas do relatório Playwright JSON"""
    if not report:
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "duration": 0
        }
    
    stats = report.get("stats", {})
    return {
        "total": stats.get("total", 0),
        "passed": stats.get("passed", 0),
        "failed": stats.get("failed", 0),
        "skipped": stats.get("skipped", 0),
        "duration": stats.get("duration", 0) / 1000  # ms to seconds
    }


def send_notification(chat_id, project, branch, commit, results, test_types):
    """Envia relatório agregado para Telegram"""
    if not NOTIFICATIONS_AVAILABLE:
        print("Notificações não disponíveis")
        return
    
    total_tests = sum(r["total"] for r in results.values())
    total_passed = sum(r["passed"] for r in results.values())
    total_failed = sum(r["failed"] for r in results.values())
    total_skipped = sum(r["skipped"] for r in results.values())
    total_duration = sum(r["duration"] for r in results.values())
    
    # Combine outputs
    combined_output = ""
    for test_type, result in results.items():
        combined_output += f"\n\n=== {test_type.upper()} ===\n{result['output']}"
    
    success = total_failed == 0
    
    if success:
        send_deploy_success(
            chat_ids=[chat_id],
            project_name=project,
            environment="tests",
            version=commit[:8] if commit else "unknown",
            deployed_by="CI/CD",
            duration=total_duration
        )
    
    send_test_report(
        chat_ids=[chat_id],
        project_name=project,
        branch=branch,
        commit_sha=commit or "unknown",
        total_tests=total_tests,
        passed=total_passed,
        failed=total_failed,
        skipped=total_skipped,
        duration=total_duration,
        pytest_output=combined_output[-1000:]  # Últimos 1000 chars
    )


def main():
    parser = argparse.ArgumentParser(description="Executa testes e notifica via Telegram")
    parser.add_argument("--project", default=os.getenv("CI_PROJECT_NAME", "unknown"))
    parser.add_argument("--branch", default=os.getenv("CI_COMMIT_BRANCH", os.getenv("GITHUB_REF_NAME", "main")))
    parser.add_argument("--commit", default=os.getenv("CI_COMMIT_SHA", os.getenv("GITHUB_SHA", "")))
    parser.add_argument("--chat-id", default=os.getenv("TELEGRAM_CHAT_ID", "1229273513"))
    parser.add_argument("--tests-dir", default="tests")
    parser.add_argument("--include-e2e", action="store_true")
    parser.add_argument("--coverage", action="store_true")
    
    args = parser.parse_args()
    
    print(f"Project: {args.project}")
    print(f"Branch: {args.branch}")
    print(f"Commit: {args.commit}")
    print()
    
    results = {}
    test_types = ["unit", "integration"]
    
    # Unit tests
    print("=" * 50)
    print("Executando testes UNITÁRIOS...")
    print("=" * 50)
    unit_result = run_pytest(f"{args.tests_dir}/unit", "unit", args.coverage)
    results["unit"] = parse_pytest_report(unit_result.get("report"))
    results["unit"]["output"] = unit_result["output"]
    results["unit"]["exit_code"] = unit_result["exit_code"]
    
    # Integration tests
    print("=" * 50)
    print("Executando testes de INTEGRAÇÃO...")
    print("=" * 50)
    int_result = run_pytest(f"{args.tests_dir}/integration", "integration", args.coverage)
    results["integration"] = parse_pytest_report(int_result.get("report"))
    results["integration"]["output"] = int_result["output"]
    results["integration"]["exit_code"] = int_result["exit_code"]
    
    # E2E tests (opcional)
    if args.include_e2e:
        print("=" * 50)
        print("Executando testes E2E...")
        print("=" * 50)
        e2e_result = run_e2e_tests()
        results["e2e"] = parse_playwright_report(e2e_result.get("report"))
        results["e2e"]["output"] = e2e_result["output"]
        results["e2e"]["exit_code"] = e2e_result["exit_code"]
        test_types.append("e2e")
    
    # Sumário
    print()
    print("=" * 50)
    print("RESUMO DOS TESTES")
    print("=" * 50)
    for test_type, result in results.items():
        status = "✅" if result["exit_code"] == 0 else "❌"
        print(f"{status} {test_type}: {result['passed']}/{result['total']} passou, "
              f"{result['failed']} falhou, {result['skipped']} pulado "
              f"({result['duration']:.1f}s)")
    
    total_failed = sum(r["failed"] for r in results.values())
    
    # Enviar notificação
    print()
    print("Enviando notificação para Telegram...")
    send_notification(
        args.chat_id,
        args.project,
        args.branch,
        args.commit,
        results,
        test_types
    )
    
    # Exit code
    if total_failed > 0:
        print(f"\n❌ {total_failed} teste(s) falharam!")
        sys.exit(1)
    else:
        print("\n✅ Todos os testes passaram!")
        sys.exit(0)


if __name__ == "__main__":
    main()
