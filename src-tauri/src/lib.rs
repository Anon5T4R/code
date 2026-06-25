use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

mod lsp;
use lsp::LspManager;

mod terminal;
use terminal::TerminalManager;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Serialize)]
struct StatusEntry {
    path: String,
    status: String,
    staged: bool,
}

#[derive(Serialize)]
struct CommitEntry {
    hash: String,
    author: String,
    message: String,
    time: String,
}

#[derive(Serialize)]
struct BranchEntry {
    name: String,
    current: bool,
}

#[derive(Serialize)]
struct RepoEntry {
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    url: String,
}

#[derive(Serialize)]
struct GithubPrResult {
    url: String,
    number: u64,
}

#[derive(Default, Serialize, Deserialize)]
struct GithubState {
    token: Option<String>,
}

// ---------------------------------------------------------------------------
// File System
// ---------------------------------------------------------------------------

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Falha ao ler '{}': {}", path, e))
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(&path).map_err(|e| format!("Falha ao ler '{}': {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    fs::write(&path, contents).map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("'{}' não é um diretório", path));
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("Falha ao ler diretório: {}", e))? {
        let entry = entry.map_err(|e| format!("Erro ao ler entrada: {}", e))?;
        let meta = entry.metadata().map_err(|e| format!("Erro ao ler metadados: {}", e))?;
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: if meta.is_file() { meta.len() } else { 0 },
        });
    }
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    Ok(entries)
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Falha ao criar diretório: {}", e))
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Falha ao remover diretório: {}", e))
    } else {
        fs::remove_file(p).map_err(|e| format!("Falha ao remover arquivo: {}", e))
    }
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Falha ao renomear: {}", e))
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct SearchMatch {
    path: String,
    line: u32,
    column: u32,
    line_content: String,
    match_start: u32,
    match_end: u32,
}

#[tauri::command]
fn search_files(root: String, query: String) -> Result<Vec<SearchMatch>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();
    let mut dirs = vec![PathBuf::from(&root)];

    while let Some(dir) = dirs.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.starts_with('.') || name == "node_modules" || name == "target" {
                    continue;
                }
                dirs.push(path);
            } else if path.is_file() {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                let binary = ["png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "otf", "eot",
                    "pdf", "zip", "gz", "tar", "exe", "dll", "so", "dylib", "bin", "class"];
                if binary.contains(&ext) {
                    continue;
                }
                let content = match fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                for (i, line) in content.lines().enumerate() {
                    if let Some(col) = line.to_lowercase().find(&query_lower) {
                        results.push(SearchMatch {
                            path: path.to_string_lossy().to_string(),
                            line: (i + 1) as u32,
                            column: (col + 1) as u32,
                            line_content: line.to_string(),
                            match_start: col as u32,
                            match_end: (col + query.len()) as u32,
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

#[tauri::command]
fn git_init(path: String) -> Result<(), String> {
    git2::Repository::init(&path).map_err(|e| format!("Falha ao init repo: {}", e))?;
    Ok(())
}

#[tauri::command]
fn git_status(repo_path: String) -> Result<Vec<StatusEntry>, String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let mut entries: Vec<StatusEntry> = Vec::new();

    let mut status_opts = git2::StatusOptions::new();
    status_opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut status_opts))
        .map_err(|e| format!("Falha ao obter status: {}", e))?;

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let flags = entry.status();

        if flags.contains(git2::Status::CONFLICTED) {
            entries.push(StatusEntry { path: path.clone(), status: "conflicted".into(), staged: false });
        }
        if flags.is_index_new() {
            entries.push(StatusEntry { path: path.clone(), status: "added".into(), staged: true });
        }
        if flags.is_index_modified() || flags.is_index_typechange() {
            entries.push(StatusEntry { path: path.clone(), status: "modified".into(), staged: true });
        }
        if flags.is_index_deleted() {
            entries.push(StatusEntry { path: path.clone(), status: "deleted".into(), staged: true });
        }
        if flags.is_index_renamed() {
            entries.push(StatusEntry { path: path.clone(), status: "renamed".into(), staged: true });
        }
        if flags.is_wt_new() {
            entries.push(StatusEntry { path: path.clone(), status: "untracked".into(), staged: false });
        }
        if flags.is_wt_modified() || flags.is_wt_typechange() {
            entries.push(StatusEntry { path: path.clone(), status: "modified".into(), staged: false });
        }
        if flags.is_wt_deleted() {
            entries.push(StatusEntry { path: path.clone(), status: "deleted".into(), staged: false });
        }
        if flags.is_wt_renamed() {
            entries.push(StatusEntry { path: path.clone(), status: "renamed".into(), staged: false });
        }
    }
    Ok(entries)
}

#[tauri::command]
fn git_add(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let mut index = repo.index().map_err(|e| format!("Falha ao abrir index: {}", e))?;
    for p in &paths {
        index.add_path(Path::new(p)).map_err(|e| format!("Falha ao adicionar '{}': {}", p, e))?;
    }
    index.write().map_err(|e| format!("Falha ao escrever index: {}", e))?;
    Ok(())
}

#[tauri::command]
fn git_unstage(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let mut index = repo.index().map_err(|e| format!("Falha ao abrir index: {}", e))?;
    for p in &paths {
        index.remove_path(Path::new(p)).map_err(|e| format!("Falha ao unstage '{}': {}", p, e))?;
    }
    index.write().map_err(|e| format!("Falha ao escrever index: {}", e))?;
    Ok(())
}

#[tauri::command]
fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let sig = git2::Signature::now("LocalCode", "localcode@local")
        .map_err(|e| format!("Falha ao criar assinatura: {}", e))?;
    let mut index = repo.index().map_err(|e| format!("Falha ao abrir index: {}", e))?;
    let tree_oid = index.write_tree().map_err(|e| format!("Falha ao escrever tree: {}", e))?;
    let tree = repo.find_tree(tree_oid).map_err(|e| format!("Falha ao encontrar tree: {}", e))?;

    let parent = match repo.head() {
        Ok(head) => {
            let parent_oid = head.target().ok_or("HEAD sem target")?;
            Some(repo.find_commit(parent_oid).map_err(|e| format!("Falha ao encontrar parent: {}", e))?)
        }
        Err(_) => None,
    };

    let parents: Vec<&git2::Commit> = parent.iter().collect();
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &message,
        &tree,
        &parents,
    ).map_err(|e| format!("Falha ao commitar: {}", e))?;
    Ok(())
}

#[tauri::command]
fn git_log(repo_path: String, max: usize) -> Result<Vec<CommitEntry>, String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("Falha ao criar revwalk: {}", e))?;
    revwalk.push_head().map_err(|e| format!("Falha ao push head: {}", e))?;

    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i >= max { break; }
        let oid = oid.map_err(|e| format!("Erro no revwalk: {}", e))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("Commit não encontrado: {}", e))?;
        commits.push(CommitEntry {
            hash: oid.to_string()[..7].to_string(),
            author: commit.author().name().unwrap_or("unknown").to_string(),
            message: commit.message().unwrap_or("").trim().to_string(),
            time: Utc::now().to_rfc3339(),
        });
    }
    Ok(commits)
}

#[tauri::command]
fn git_branches(repo_path: String) -> Result<Vec<BranchEntry>, String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let mut branches = Vec::new();

    let current_head = repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string()));

    let result = repo.branches(Some(git2::BranchType::Local));
    if let Ok(branch_iter) = result {
        for b in branch_iter.flatten() {
            let name = b.0.name().ok().flatten().unwrap_or("unknown").to_string();
            branches.push(BranchEntry {
                current: Some(name.clone()) == current_head,
                name,
            });
        }
    }
    Ok(branches)
}

#[tauri::command]
fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;

    let obj = repo.revparse_single(&branch)
        .map_err(|e| format!("Falha ao resolver '{}': {}", branch, e))?;
    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Falha no checkout tree: {}", e))?;
    repo.set_head(&format!("refs/heads/{}", branch))
        .map_err(|e| format!("Falha ao set HEAD: {}", e))?;
    Ok(())
}

#[tauri::command]
fn git_branch_create(repo_path: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;
    let head = repo.head().map_err(|e| format!("Falha ao ler HEAD: {}", e))?;
    let commit = head.peel_to_commit().map_err(|e| format!("Falha ao peel commit: {}", e))?;
    repo.branch(&name, &commit, false)
        .map_err(|e| format!("Falha ao criar branch: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

fn github_token_path(app: &tauri::AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push(".github_token.json");
    path
}

#[tauri::command]
fn github_set_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let state = GithubState { token: Some(token) };
    let path = github_token_path(&app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string(&state).map_err(|e| format!("Erro serializando: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Erro salvando token: {}", e))?;
    Ok(())
}

#[tauri::command]
fn github_get_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = github_token_path(&app);
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("Erro lendo token: {}", e))?;
    let state: GithubState = serde_json::from_str(&json).map_err(|e| format!("Erro parse: {}", e))?;
    Ok(state.token)
}

#[tauri::command]
fn github_remove_token(app: tauri::AppHandle) -> Result<(), String> {
    let path = github_token_path(&app);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Erro removendo token: {}", e))?;
    }
    Ok(())
}

fn get_octocrab(token: &str) -> octocrab::Octocrab {
    octocrab::OctocrabBuilder::new()
        .personal_token(token.to_string())
        .build()
        .expect("Falha ao criar cliente GitHub")
}

#[tauri::command]
async fn github_list_repos(token: String) -> Result<Vec<RepoEntry>, String> {
    let octocrab = get_octocrab(&token);
    let repos = octocrab
        .current()
        .list_repos_for_authenticated_user()
        .per_page(50)
        .send()
        .await
        .map_err(|e| format!("Erro ao listar repos: {}", e))?;

    Ok(repos
        .items
        .iter()
        .map(|r| RepoEntry {
            name: r.name.clone(),
            full_name: r.full_name.clone().unwrap_or_default(),
            description: r.description.clone(),
            private: r.private.unwrap_or(false),
            url: r.html_url.as_ref().map(|u| u.to_string()).unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
async fn github_create_repo(token: String, name: String, private: bool, description: String) -> Result<RepoEntry, String> {
    let octocrab = get_octocrab(&token);
    let repo: serde_json::Value = octocrab
        .post("/user/repos", Some(&serde_json::json!({
            "name": name,
            "private": private,
            "description": description,
        })))
        .await
        .map_err(|e| format!("Erro ao criar repo: {}", e))?;

    Ok(RepoEntry {
        name: repo["name"].as_str().unwrap_or("").to_string(),
        full_name: repo["full_name"].as_str().unwrap_or("").to_string(),
        description: repo["description"].as_str().map(|s| s.to_string()),
        private: repo["private"].as_bool().unwrap_or(false),
        url: repo["html_url"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
async fn github_create_pr(
    token: String,
    owner: String,
    repo: String,
    title: String,
    body: String,
    head: String,
    base: String,
) -> Result<GithubPrResult, String> {
    let octocrab = get_octocrab(&token);
    let pr = octocrab
        .pulls(&owner, &repo)
        .create(title, head, base)
        .body(&body)
        .send()
        .await
        .map_err(|e| format!("Erro ao criar PR: {}", e))?;

    Ok(GithubPrResult {
        url: pr.html_url.map(|u| u.to_string()).unwrap_or_default(),
        number: pr.number,
    })
}

#[tauri::command]
async fn github_clone_repo(url: String, dest: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        git2::Repository::clone(&url, &dest)
            .map_err(|e| format!("Falha ao clonar repo: {}", e))
    })
    .await
    .map_err(|e| format!("Erro na thread: {}", e))?
    .map(|_| ())
}

#[tauri::command]
fn git_push(repo_path: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;

    let mut remote = repo.find_remote("origin")
        .map_err(|e| format!("Falha ao encontrar remote 'origin': {}", e))?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.push_update_reference(|refname, status| {
        if let Some(msg) = status {
            Err(git2::Error::from_str(&format!("Push rejeitado em {}: {}", refname, msg)))
        } else {
            Ok(())
        }
    });

    let mut push_opts = git2::PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    let head_ref = repo.head()
        .map_err(|e| format!("Falha ao ler HEAD: {}", e))?
        .name()
        .ok_or("HEAD sem nome")?
        .to_string();

    remote.push(&[&head_ref], Some(&mut push_opts))
        .map_err(|e| format!("Falha ao fazer push: {}", e))?;
    Ok(())
}

#[tauri::command]
fn git_pull(repo_path: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| format!("Falha ao abrir repo: {}", e))?;

    let mut remote = repo.find_remote("origin")
        .map_err(|e| format!("Falha ao encontrar remote 'origin': {}", e))?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.transfer_progress(|_progress| true);

    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    remote.fetch(&["refs/heads/*:refs/heads/*"], Some(&mut fetch_opts), None)
        .map_err(|e| format!("Falha ao fazer fetch: {}", e))?;

    let fetch_head = repo.find_reference("FETCH_HEAD")
        .map_err(|e| format!("Falha ao encontrar FETCH_HEAD: {}", e))?;
    let fetch_commit = fetch_head.peel_to_commit()
        .map_err(|e| format!("Falha ao peel FETCH_HEAD: {}", e))?;

    let head = repo.head().map_err(|e| format!("Falha ao ler HEAD: {}", e))?;
    let head_commit = head.peel_to_commit()
        .map_err(|e| format!("Falha ao peel HEAD: {}", e))?;

    let mut merge_opts = git2::MergeOptions::new();
    let annotated = repo.find_annotated_commit(fetch_commit.id())
        .map_err(|e| format!("Falha ao criar annotated commit: {}", e))?;
    repo.merge(&[&annotated], Some(&mut merge_opts), None)
        .map_err(|e| format!("Falha no merge: {}", e))?;

    if repo.index().map_err(|e| format!("Falha ao ler index: {}", e))?.has_conflicts() {
        return Err("Conflitos de merge detectados.".into());
    }

    let sig = git2::Signature::now("LocalCode", "localcode@local")
        .map_err(|e| format!("Falha ao criar signature: {}", e))?;
    let tree_oid = repo.index()
        .map_err(|e| format!("Falha ao ler index: {}", e))?
        .write_tree()
        .map_err(|e| format!("Falha ao escrever tree: {}", e))?;
    let tree = repo.find_tree(tree_oid)
        .map_err(|e| format!("Falha ao encontrar tree: {}", e))?;

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &format!("Merge pull from origin"),
        &tree,
        &[&head_commit, &fetch_commit],
    ).map_err(|e| format!("Falha ao commitar merge: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// LSP
// ---------------------------------------------------------------------------

use std::sync::Arc;

#[tauri::command]
async fn lsp_start(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    workspace_root: String,
) -> Result<String, String> {
    manager.start(language, workspace_root).await
}

#[tauri::command]
async fn lsp_stop(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
) -> Result<(), String> {
    manager.stop(&language).await
}

#[tauri::command]
async fn lsp_did_open(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    manager.did_open(&language, &file_path, &content).await
}

#[tauri::command]
async fn lsp_did_change(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    content: String,
    version: i32,
) -> Result<Vec<lsp::LspDiagnostic>, String> {
    manager.did_change(&language, &file_path, &content, version).await
}

#[tauri::command]
async fn lsp_did_close(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
) -> Result<(), String> {
    manager.did_close(&language, &file_path).await
}

#[tauri::command]
async fn lsp_completion(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<Vec<lsp::LspCompletion>, String> {
    manager.completion(&language, &file_path, line, column).await
}

#[tauri::command]
async fn lsp_hover(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<Option<lsp::LspHover>, String> {
    manager.hover(&language, &file_path, line, column).await
}

#[tauri::command]
async fn lsp_signature_help(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<Option<lsp::LspSignatureHelp>, String> {
    manager.signature_help(&language, &file_path, line, column).await
}

#[tauri::command]
async fn lsp_code_action(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<Vec<lsp::LspCodeAction>, String> {
    manager.code_action(&language, &file_path, line, column).await
}

#[tauri::command]
async fn lsp_go_to_definition(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<Option<lsp::LspLocation>, String> {
    manager.go_to_definition(&language, &file_path, line, column).await
}

#[tauri::command]
async fn lsp_find_references(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<Vec<lsp::LspLocation>, String> {
    manager.find_references(&language, &file_path, line, column).await
}

#[tauri::command]
async fn lsp_document_symbols(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
) -> Result<Vec<lsp::LspSymbol>, String> {
    manager.document_symbols(&language, &file_path).await
}

#[tauri::command]
async fn lsp_format_document(
    manager: tauri::State<'_, Arc<LspManager>>,
    language: String,
    file_path: String,
) -> Result<Vec<lsp::LspTextEdit>, String> {
    manager.format_document(&language, &file_path).await
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

#[tauri::command]
async fn terminal_spawn(
    manager: tauri::State<'_, Arc<TerminalManager>>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    manager.spawn(app).await
}

#[tauri::command]
async fn terminal_write(
    manager: tauri::State<'_, Arc<TerminalManager>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    manager.write(&session_id, data).await
}

#[tauri::command]
async fn terminal_resize(
    manager: tauri::State<'_, Arc<TerminalManager>>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    manager.resize(&session_id, rows, cols).await
}

#[tauri::command]
async fn terminal_kill(
    manager: tauri::State<'_, Arc<TerminalManager>>,
    session_id: String,
) -> Result<(), String> {
    manager.kill(&session_id).await
}

#[tauri::command]
fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = argv.iter().skip(1).find(|a| Path::new(a).is_file()) {
                let _ = app.emit("open-file", file.clone());
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(LspManager::new()))
        .manage(Arc::new(TerminalManager::new()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            read_file_base64,
            write_text_file,
            list_dir,
            create_dir,
            delete_file,
            rename_file,
            git_init,
            git_status,
            git_add,
            git_unstage,
            git_commit,
            git_log,
            git_branches,
            git_checkout,
            git_branch_create,
            git_push,
            git_pull,
            github_set_token,
            github_get_token,
            github_remove_token,
            github_list_repos,
            github_create_repo,
            github_create_pr,
            github_clone_repo,
            lsp_start,
            lsp_stop,
            lsp_did_open,
            lsp_did_change,
            lsp_did_close,
            lsp_completion,
            lsp_hover,
            lsp_signature_help,
            lsp_code_action,
            lsp_go_to_definition,
            lsp_find_references,
            lsp_document_symbols,
            lsp_format_document,
            search_files,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            get_startup_file,
            exit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
