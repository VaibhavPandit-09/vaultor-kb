package com.vaultorandroid

import org.json.JSONObject

/** Only consume responses after pinned TLS and captured approval validation.
 * HTTP status alone is never evidence of source revocation or replacement. */
internal object VaultorSourceAccess {
    fun invalidates(path: String, status: Int, body: JSONObject): Boolean {
        val code = body.optString("code")
        if (status == 401 && code == "DEVICE_APPROVAL_REQUIRED") return true
        if (status == 403 && code == "WORKSPACE_ACCESS_REVOKED") return true
        if (status == 404 && code == "WORKSPACE_UNAVAILABLE")
            return Regex("/(resources|tags|settings|collections|organization|reviews|workspace|imports|exports|operations|companions|changes|diagnostics|collected-zips)(/.*)?").matches(path.substringBefore('?')) || path=="/capabilities"
        if (status != 409) return false
        return when (code) {
            "COMPANION_GENERATION_CHANGED" -> path.startsWith("/companions/") && !path.startsWith("/companions/exports/")
            "EXPORT_GENERATION_CHANGED" -> path.startsWith("/companions/exports/")
            "IMPORT_GENERATION_CHANGED" -> path.startsWith("/resources/collected-imports/") || path.startsWith("/collected-zips/")
            "REVIEW_GENERATION_CHANGED" -> path.startsWith("/reviews/")
            else -> false
        }
    }
}
