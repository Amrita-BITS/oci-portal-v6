/**
 * services-functions.js
 * Handles all Services tab functionality: groups, instances, sequences, and execution.
 */

// ============================================================================
// STATE
// ============================================================================

let currentGroupId = null;
let currentGroup = null;
let serviceTabs = {};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format date-time string for display
 */
function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get JWT token from localStorage
 */
function getToken() {
  return localStorage.getItem("jwt_token");
}

/**
 * Make API call with error handling
 */
async function apiCall(endpoint, options = {}) {
  const defaultOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
  };

  const finalOptions = { ...defaultOptions, ...options };
  if (options.headers) {
    finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
  }

  try {
    const response = await fetch(endpoint, finalOptions);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    showToast(`Error: ${error.message}`, "error");
    throw error;
  }
}

// ============================================================================
// SERVICE GROUPS
// ============================================================================

/**
 * Load all service groups
 */
async function loadServiceGroups() {
  try {
    const groups = await apiCall("/api/services/groups");
    renderServiceGroupsTable(groups);
  } catch (error) {
    console.error("Failed to load service groups:", error);
  }
}

/**
 * Render service groups table
 */
function renderServiceGroupsTable(groups) {
  const tbody = document.getElementById("service-groups-body");
  
  if (!groups || groups.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; color: #999;">No service groups yet. Create one to get started.</td></tr>';
    return;
  }

  tbody.innerHTML = groups
    .map(
      (group) => `
    <tr>
      <td>
        <a href="#" onclick="selectGroup(${group.id}); return false;" style="cursor: pointer; color: #0066cc; text-decoration: none;">
          <strong>${escapeHtml(group.name)}</strong>
        </a>
      </td>
      <td>${group.description ? escapeHtml(group.description) : "—"}</td>
      <td><span class="badge badge-info">${group.instances?.length || 0}</span></td>
      <td><span class="badge badge-info">${group.sequences?.length || 0}</span></td>
      <td>${group.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
      <td>${formatDateTime(group.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="selectGroup(${group.id})">Manage</button>
        <button class="btn btn-sm btn-danger" onclick="deleteServiceGroup(${group.id})">Delete</button>
      </td>
    </tr>
  `
    )
    .join("");
}

/**
 * Show create service group modal
 */
function showServiceGroupModal() {
  const name = prompt("Enter service group name:");
  if (!name) return;

  const description = prompt("Enter description (optional):") || "";
  createServiceGroup(name, description);
}

/**
 * Create new service group
 */
async function createServiceGroup(name, description) {
  try {
    const payload = {
      name: name.trim(),
      description: description.trim(),
    };

    await apiCall("/api/services/groups", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast(`Service group "${name}" created successfully`, "success");
    await loadServiceGroups();
  } catch (error) {
    console.error("Failed to create service group:", error);
  }
}

/**
 * Delete service group
 */
async function deleteServiceGroup(groupId) {
  if (!confirm("Are you sure you want to delete this service group?")) return;

  try {
    await apiCall(`/api/services/groups/${groupId}`, {
      method: "DELETE",
    });

    showToast("Service group deleted", "success");
    clearGroupSelection();
    await loadServiceGroups();
  } catch (error) {
    console.error("Failed to delete service group:", error);
  }
}

/**
 * Select and view group details
 */
async function selectGroup(groupId) {
  try {
    currentGroup = await apiCall(`/api/services/groups/${groupId}`);
    currentGroupId = groupId;

    // Hide groups list, show details
    document.getElementById("service-groups-list").style.display = "none";
    document.getElementById("group-details-section").style.display = "block";
    document.getElementById("selected-group-name").textContent = `${currentGroup.name} Details`;

    // Render details
    renderInstancesList();
    renderSequencesList();
    loadExecutionHistory();
  } catch (error) {
    console.error("Failed to load group details:", error);
  }
}

/**
 * Clear group selection and return to groups list
 */
function clearGroupSelection() {
  currentGroupId = null;
  currentGroup = null;
  document.getElementById("service-groups-list").style.display = "block";
  document.getElementById("group-details-section").style.display = "none";
}

// ============================================================================
// INSTANCES
// ============================================================================

/**
 * Render instances list for current group
 */
function renderInstancesList() {
  if (!currentGroup) return;

  const tbody = document.getElementById("instances-body");
  const instances = currentGroup.instances || [];

  if (instances.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align: center; color: #999;">No instances added. Add one to include in this service.</td></tr>';
    return;
  }

  tbody.innerHTML = instances
    .map(
      (inst) => `
    <tr>
      <td>${escapeHtml(inst.instance_name)}</td>
      <td><code style="font-size: 11px; word-break: break-all;">${escapeHtml(inst.oci_instance_id)}</code></td>
      <td>${escapeHtml(inst.region)}</td>
      <td><code style="font-size: 11px; word-break: break-all;">${escapeHtml(inst.compartment_id)}</code></td>
      <td>#${inst.sequence_order}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeInstanceFromGroup(${inst.id})">Remove</button>
      </td>
    </tr>
  `
    )
    .join("");
}

/**
 * Show add instance modal
 */
function showAddInstanceModal() {
  if (!currentGroupId) {
    showToast("No group selected", "error");
    return;
  }

  const instanceId = prompt(
    "Enter OCI Instance ID (e.g., ocid1.instance.oc1.ap-sydney-1.xxx):"
  );
  if (!instanceId) return;

  const instanceName = prompt("Enter instance display name:");
  if (!instanceName) return;

  const region = prompt("Enter region (e.g., ap-sydney-1):");
  if (!region) return;

  const compartmentId = prompt("Enter compartment OCID:");
  if (!compartmentId) return;

  addInstanceToGroup(instanceId, instanceName, region, compartmentId);
}

/**
 * Add instance to service group
 */
async function addInstanceToGroup(ocidId, name, region, compartment) {
  try {
    await apiCall(`/api/services/groups/${currentGroupId}/instances`, {
      method: "POST",
      body: JSON.stringify({
        oci_instance_id: ocidId.trim(),
        instance_name: name.trim(),
        region: region.trim(),
        compartment_id: compartment.trim(),
      }),
    });

    showToast(`Instance "${name}" added to group`, "success");
    const group = await apiCall(`/api/services/groups/${currentGroupId}`);
    currentGroup = group;
    renderInstancesList();
  } catch (error) {
    console.error("Failed to add instance:", error);
  }
}

/**
 * Remove instance from group
 */
async function removeInstanceFromGroup(instanceId) {
  if (!confirm("Remove this instance from the group?")) return;

  try {
    await apiCall(`/api/services/instances/${instanceId}`, {
      method: "DELETE",
    });

    showToast("Instance removed from group", "success");
    const group = await apiCall(`/api/services/groups/${currentGroupId}`);
    currentGroup = group;
    renderInstancesList();
  } catch (error) {
    console.error("Failed to remove instance:", error);
  }
}

// ============================================================================
// SEQUENCES
// ============================================================================

/**
 * Render sequences for current group
 */
function renderSequencesList() {
  if (!currentGroup) return;

  const sequences = currentGroup.sequences || [];

  // Separate by action
  const startSeqs = sequences.filter((s) => s.action === "start").sort((a, b) => a.sequence_number - b.sequence_number);
  const stopSeqs = sequences.filter((s) => s.action === "stop").sort((a, b) => a.sequence_number - b.sequence_number);

  // Render START sequences
  const startContainer = document.getElementById("start-sequences-list");
  if (startSeqs.length === 0) {
    startContainer.innerHTML = '<p style="color: #999; padding: 20px; text-align: center;">No START steps configured</p>';
  } else {
    startContainer.innerHTML = startSeqs
      .map(
        (seq) => `
      <div class="sequence-step">
        <div class="sequence-step-header">
          <strong>Step ${seq.sequence_number}</strong>
          <span class="action-badge action-start">START</span>
        </div>
        <div class="sequence-step-details">
          <p><strong>Instance:</strong> ${getInstanceName(seq.instance_id)}</p>
          <p><strong>Wait After:</strong> ${seq.wait_minutes} minutes</p>
          <p><strong>Condition:</strong> ${seq.condition_type || "none"} ${seq.condition_value ? `(${seq.condition_value})` : ""}</p>
        </div>
        <div class="sequence-step-actions">
          <button class="btn btn-sm btn-primary" onclick="editSequenceStep(${seq.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSequenceStep(${seq.id})">Delete</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  // Render STOP sequences
  const stopContainer = document.getElementById("stop-sequences-list");
  if (stopSeqs.length === 0) {
    stopContainer.innerHTML = '<p style="color: #999; padding: 20px; text-align: center;">No STOP steps configured</p>';
  } else {
    stopContainer.innerHTML = stopSeqs
      .map(
        (seq) => `
      <div class="sequence-step">
        <div class="sequence-step-header">
          <strong>Step ${seq.sequence_number}</strong>
          <span class="action-badge action-stop">STOP</span>
        </div>
        <div class="sequence-step-details">
          <p><strong>Instance:</strong> ${getInstanceName(seq.instance_id)}</p>
          <p><strong>Wait After:</strong> ${seq.wait_minutes} minutes</p>
          <p><strong>Condition:</strong> ${seq.condition_type || "none"} ${seq.condition_value ? `(${seq.condition_value})` : ""}</p>
        </div>
        <div class="sequence-step-actions">
          <button class="btn btn-sm btn-primary" onclick="editSequenceStep(${seq.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSequenceStep(${seq.id})">Delete</button>
        </div>
      </div>
    `
      )
      .join("");
  }
}

/**
 * Get instance name from group
 */
function getInstanceName(instanceId) {
  if (!currentGroup) return "Unknown";
  const inst = (currentGroup.instances || []).find((i) => i.id === instanceId);
  return inst ? inst.instance_name : `Instance #${instanceId}`;
}

/**
 * Show add sequence modal
 */
function showAddSequenceModal() {
  if (!currentGroupId) {
    showToast("No group selected", "error");
    return;
  }

  if (!currentGroup.instances || currentGroup.instances.length === 0) {
    showToast("Add instances to the group first", "error");
    return;
  }

  const action = prompt("Enter action (start/stop):");
  if (!action || !["start", "stop"].includes(action.toLowerCase())) {
    showToast("Invalid action", "error");
    return;
  }

  const instanceIdStr = prompt(
    "Enter instance ID (" + currentGroup.instances.map((i) => i.id).join("/") + "):"
  );
  if (!instanceIdStr) return;

  const instanceId = parseInt(instanceIdStr, 10);
  const seqNumber = prompt("Enter sequence number (1, 2, 3, ...):");
  if (!seqNumber) return;

  const waitMinutes = prompt("Wait minutes after this step (default 0):") || "0";
  const conditionType = prompt(
    "Condition type (minutes_after / status_check / manual, or leave blank):"
  ) || null;
  const conditionValue = conditionType ? prompt("Condition value:") : null;

  createSequenceStep(
    action.toLowerCase(),
    instanceId,
    parseInt(seqNumber, 10),
    parseInt(waitMinutes, 10),
    conditionType,
    conditionValue
  );
}

/**
 * Create sequence step
 */
async function createSequenceStep(
  action,
  instanceId,
  seqNumber,
  waitMinutes,
  conditionType,
  conditionValue
) {
  try {
    const payload = {
      action,
      instance_id: instanceId,
      sequence_number: seqNumber,
      wait_minutes: waitMinutes,
      condition_type: conditionType || null,
      condition_value: conditionValue || null,
    };

    await apiCall(`/api/services/groups/${currentGroupId}/sequences`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast(`Sequence step created", "success");
    const group = await apiCall(`/api/services/groups/${currentGroupId}`);
    currentGroup = group;
    renderSequencesList();
  } catch (error) {
    console.error("Failed to create sequence step:", error);
  }
}

/**
 * Delete sequence step
 */
async function deleteSequenceStep(stepId) {
  if (!confirm("Delete this sequence step?")) return;

  try {
    await apiCall(`/api/services/sequences/${stepId}`, {
      method: "DELETE",
    });

    showToast("Sequence step deleted", "success");
    const group = await apiCall(`/api/services/groups/${currentGroupId}`);
    currentGroup = group;
    renderSequencesList();
  } catch (error) {
    console.error("Failed to delete sequence step:", error);
  }
}

/**
 * Edit sequence step (simplified)
 */
async function editSequenceStep(stepId) {
  showToast("Edit functionality coming soon. Delete and recreate for now.", "info");
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute service group
 */
async function executeServiceGroup(action) {
  if (!currentGroupId) {
    showToast("No group selected", "error");
    return;
  }

  if (
    !confirm(
      `Are you sure you want to ${action.toUpperCase()} this service group? This will execute the configured sequence.`
    )
  ) {
    return;
  }

  try {
    const response = await apiCall(`/api/services/groups/${currentGroupId}/execute`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });

    showToast(
      `${action.toUpperCase()} execution started (ID: ${response.id})`,
      "success"
    );

    // Poll status
    pollExecutionStatus(response.id);

    // Reload history
    await loadExecutionHistory();
  } catch (error) {
    console.error("Failed to execute service:", error);
  }
}

/**
 * Poll execution status
 */
async function pollExecutionStatus(executionId, attempts = 0) {
  if (attempts > 60) {
    // 60 attempts = 5 minutes with 5 second interval
    showToast("Execution timeout - check history for details", "warning");
    return;
  }

  try {
    const status = await apiCall(`/api/services/executions/${executionId}`);

    showToast(
      `Execution ${status.execution_id}: ${status.status} (${status.progress_percent}%)`,
      "info"
    );

    if (status.status !== "running") {
      // Execution complete
      await loadExecutionHistory();
      return;
    }

    // Poll again in 5 seconds
    setTimeout(() => pollExecutionStatus(executionId, attempts + 1), 5000);
  } catch (error) {
    console.error("Failed to poll execution status:", error);
  }
}

/**
 * Load execution history
 */
async function loadExecutionHistory() {
  if (!currentGroupId) return;

  try {
    const executions = await apiCall(
      `/api/services/executions?group_id=${currentGroupId}&limit=20`
    );
    renderExecutionHistory(executions);
  } catch (error) {
    console.error("Failed to load execution history:", error);
  }
}

/**
 * Render execution history
 */
function renderExecutionHistory(executions) {
  const tbody = document.getElementById("execution-history-body");

  if (!executions || executions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align: center; color: #999;">No executions yet</td></tr>';
    return;
  }

  tbody.innerHTML = executions
    .map(
      (exec) => `
    <tr>
      <td><strong>${exec.action.toUpperCase()}</strong></td>
      <td>
        <span class="badge badge-${getStatusBadgeClass(exec.status)}">
          ${exec.status.toUpperCase()}
        </span>
      </td>
      <td>${formatDateTime(exec.started_at)}</td>
      <td>${exec.completed_at ? formatDateTime(exec.completed_at) : "—"}</td>
      <td>${escapeHtml(exec.executed_by)}</td>
      <td>${exec.error_message ? escapeHtml(exec.error_message) : "—"}</td>
    </tr>
  `
    )
    .join("");
}

/**
 * Get badge class for status
 */
function getStatusBadgeClass(status) {
  switch (status) {
    case "running":
      return "warning";
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "cancelled":
      return "secondary";
    default:
      return "info";
  }
}

// ============================================================================
// DETAILS TAB SWITCHING
// ============================================================================

/**
 * Switch between details tabs (Instances, Sequences, Execution)
 */
function switchDetailsTab(event, tabName) {
  event.preventDefault();

  // Hide all tabs
  document.querySelectorAll(".details-tab-content").forEach((tab) => {
    tab.style.display = "none";
  });
  document.querySelectorAll(".tab-link").forEach((btn) => {
    btn.classList.remove("active");
  });

  // Show selected tab
  document.getElementById(tabName).style.display = "block";
  event.target.classList.add("active");
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
